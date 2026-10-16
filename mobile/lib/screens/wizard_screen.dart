import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models.dart';
import '../services/record_service.dart';
import '../theme.dart';

const _topLevelRoles = {'company', 'branch', 'terminalId', 'anydeskNo', 'installDate'};

class WizardScreen extends StatefulWidget {
  final String recordId;
  final bool readOnly;
  const WizardScreen({super.key, required this.recordId, this.readOnly = false});
  @override
  State<WizardScreen> createState() => _WizardScreenState();
}

class _WizardScreenState extends State<WizardScreen> {
  late final RecordService _svc = context.read<RecordService>();
  Json? _rec;
  Template? _tpl;
  final Map<String, Answer> _answers = {};
  final Map<String, dynamic> _top = {};
  String _remark = '';
  String? _signatureUrl;
  int _step = 0;
  final Set<String> _attempted = {};
  Timer? _debounce;
  bool _busy = false;
  String? _loadError;

  bool get _ro => widget.readOnly;
  int get _reviewIndex => _tpl!.sections.length;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    if (!_ro && _rec != null) _flush();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final snap = await _svc.watchOne(widget.recordId);
      final rec = snap.data()!;
      final tpl = await _svc.templateVersion(rec['templateVersion'] as int);
      (rec['answers'] as Map? ?? {}).forEach((k, v) => _answers['$k'] = Answer.fromJson(Map<String, dynamic>.from(v as Map)));
      for (final r in _topLevelRoles) {
        _top[r] = rec[r];
      }
      _remark = (rec['remark'] ?? '') as String;
      _signatureUrl = rec['signatureUrl'] as String?;
      // apply defaults to untouched fields
      for (final s in tpl.sections) {
        for (final f in s.visibleFields) {
          if (_answers[f.key] == null && f.defaultValue != null && !_ro) {
            _answers[f.key] = Answer(value: f.defaultValue == 'today' ? DateTime.now().toIso8601String().substring(0, 10) : f.defaultValue);
          } else if (f.role != null && _answers[f.key] == null && '${_top[f.role] ?? ''}'.isNotEmpty) {
            _answers[f.key] = Answer(value: _top[f.role]);
          }
        }
      }
      if (mounted) setState(() { _rec = rec; _tpl = tpl; });
    } catch (e) {
      if (mounted) setState(() => _loadError = '$e');
    }
  }

  Json _payload() {
    for (final s in _tpl!.sections) {
      for (final f in s.visibleFields) {
        if (f.role != null && _topLevelRoles.contains(f.role)) _top[f.role!] = '${_answers[f.key]?.value ?? ''}';
      }
    }
    return {
      'answers': {for (final e in _answers.entries) if (!e.value.isEmpty || e.value.note.isNotEmpty || e.value.photoUrls.isNotEmpty) e.key: e.value.toJson()},
      for (final e in _top.entries) e.key: e.value ?? '',
      'remark': _remark,
      if (_signatureUrl != null) 'signatureUrl': _signatureUrl,
    };
  }

  void _changed() {
    if (_ro) return;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 600), _flush);
  }

  void _flush() {
    _debounce?.cancel();
    if (_ro || _tpl == null) return;
    _svc.save(widget.recordId, _payload()).catchError((_) {});
  }

  void _set(FieldDef f, void Function(Answer a) fn) {
    final a = _answers.putIfAbsent(f.key, () => Answer());
    setState(() => fn(a));
    _changed();
  }

  // ---- progress ----
  List<FieldDef> _fields(SectionDef s) => s.visibleFields.where((f) => isVisible(f, _answers)).toList();
  int _doneCount(SectionDef s) => _fields(s).where((f) => !(_answers[f.key]?.isEmpty ?? true)).length;
  List<FieldDef> _missing(SectionDef s) => _fields(s).where((f) => validateField(f, _answers[f.key]) != null).toList();
  int get _overallPct {
    final all = _tpl!.sections.expand(_fields).toList();
    if (all.isEmpty) return 100;
    return (all.where((f) => !(_answers[f.key]?.isEmpty ?? true)).length * 100 / all.length).round();
  }

  String _state(SectionDef s) {
    final total = _fields(s).length, done = _doneCount(s);
    if (_attempted.contains(s.id) && _missing(s).isNotEmpty) return 'error';
    if (total > 0 && done == total && _missing(s).isEmpty) return 'complete';
    return done > 0 ? 'progress' : 'none';
  }

  void _go(int to) {
    if (_step < _reviewIndex && _missing(_tpl!.sections[_step]).isNotEmpty) _attempted.add(_tpl!.sections[_step].id);
    _flush();
    setState(() => _step = to);
  }

  Future<void> _next() async {
    final s = _tpl!.sections[_step];
    if (_missing(s).isNotEmpty) {
      _attempted.add(s.id);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${_missing(s).length} required field(s) incomplete in "${s.name}"')));
    }
    _go(_step + 1);
  }

  // ---- submit ----
  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      final p = _payload();
      if (await _svc.hasDuplicate(widget.recordId, '${p['company']}', '${p['branch']}', '${p['terminalId']}')) {
        if (!mounted) return;
        final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: const Text('Possible duplicate'), content: const Text('A submitted record with the same company, branch and terminal ID already exists. Submit anyway?'), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Submit anyway'))]));
        if (ok != true) return;
      }
      final loc = await _svc.location();
      // not awaited to completion when offline: Firestore queues the write
      unawaited(_svc.submit(widget.recordId, {...p, 'location': ?loc, 'reviewComment': ''}).catchError((_) {}));
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Submitted. It will appear in review once synced.')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _discard() async {
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: const Text('Discard draft?'), content: const Text('This cannot be undone.'), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Discard'))]));
    if (ok != true) return;
    _debounce?.cancel();
    await _svc.discard(widget.recordId);
    if (mounted) Navigator.pop(context);
  }

  // ---- UI ----
  @override
  Widget build(BuildContext context) {
    if (_loadError != null) return Scaffold(appBar: AppBar(), body: Center(child: Text('Could not load record\n$_loadError')));
    if (_tpl == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final secs = _tpl!.sections;
    final onReview = _step == _reviewIndex;
    final status = '${_rec!['status']}';
    return Scaffold(
      appBar: AppBar(
        title: Text(onReview ? 'Review & Submit' : secs[_step].name, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          Center(child: Padding(padding: const EdgeInsets.only(right: 8), child: Text('$_overallPct%', style: const TextStyle(fontWeight: FontWeight.w600)))),
          if (!_ro && status == 'draft') IconButton(tooltip: 'Discard draft', icon: const Icon(Icons.delete_outline), onPressed: _discard),
        ],
      ),
      body: Column(children: [
        _stepper(secs),
        if (status == 'returned' && '${_rec!['reviewComment'] ?? ''}'.isNotEmpty)
          MaterialBanner(backgroundColor: Theme.of(context).colorScheme.errorContainer, content: Text('Returned by supervisor: ${_rec!['reviewComment']}'), actions: const [SizedBox()]),
        Expanded(
          // Read-only: ignore taps on each item, but keep the list itself scrollable.
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [for (final w in onReview ? _review(secs) : _section(secs[_step])) IgnorePointer(ignoring: _ro, child: w)],
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(child: OutlinedButton(onPressed: _step == 0 ? null : () => _go(_step - 1), child: const Text('Back'))),
              const SizedBox(width: 12),
              Expanded(child: onReview ? (_ro ? const SizedBox() : FilledButton(onPressed: _busy || secs.any((s) => _missing(s).isNotEmpty) ? null : _submit, child: const Text('Submit'))) : FilledButton(onPressed: _next, child: const Text('Next'))),
            ]),
          ),
        ),
      ]),
    );
  }

  /// Step header: "Step 2 of 6" + section name, then tappable numbered circles joined by lines.
  Widget _stepper(List<SectionDef> secs) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final green = dark ? const Color(0xFF86D9A5) : const Color(0xFF2E9E5B);
    final total = secs.length + 1;
    final states = [for (final s in secs) _state(s), secs.every((s) => _missing(s).isEmpty) ? 'complete' : 'none'];
    final names = [for (final s in secs) s.name, 'Review & Submit'];

    Widget circle(int i) {
      final st = states[i], current = i == _step;
      final done = st == 'complete', err = st == 'error';
      final fill = done ? green : err ? cs.error : null;
      final border = done ? green : err ? cs.error : current ? cs.primary : cs.outlineVariant;
      final fg = done ? (dark ? Colors.black : Colors.white) : err ? cs.onError : current ? cs.primary : cs.onSurfaceVariant;
      return Semantics(
        button: true,
        label: 'Step ${i + 1} of $total, ${names[i]}, ${done ? 'complete' : err ? 'has errors' : st == 'progress' ? 'in progress' : 'not started'}',
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => _go(i),
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                width: current ? 44 : 40,
                height: current ? 44 : 40,
                decoration: BoxDecoration(shape: BoxShape.circle, color: fill, border: Border.all(color: border, width: current ? 2.5 : 1.5)),
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                  child: done
                      ? Icon(Icons.check, key: const ValueKey('c'), size: 20, color: fg)
                      : err
                          ? Icon(Icons.priority_high, key: const ValueKey('e'), size: 20, color: fg)
                          : Text('${i + 1}', key: ValueKey('n$i'), style: TextStyle(color: fg, fontWeight: current ? FontWeight.w600 : FontWeight.w500)),
                ),
              ),
            ),
          ),
        ),
      );
    }

    Widget line(int i) => Container(width: 28, height: 2, color: states[i] == 'complete' ? green : cs.outlineVariant);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: cs.outlineVariant))),
      child: Column(children: [
        Row(children: [
          Text('Step ${_step + 1} of $total', style: TextStyle(color: green, fontWeight: FontWeight.w600)),
          const SizedBox(width: 12),
          Expanded(child: Text(names[_step], textAlign: TextAlign.right, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: cs.onSurfaceVariant, fontSize: 16))),
        ]),
        const SizedBox(height: 4),
        SizedBox(
          height: 52,
          child: LayoutBuilder(builder: (context, c) {
            final row = Row(mainAxisSize: MainAxisSize.min, children: [for (var i = 0; i < total; i++) ...[if (i > 0) line(i - 1), circle(i)]]);
            return SingleChildScrollView(scrollDirection: Axis.horizontal, child: ConstrainedBox(constraints: BoxConstraints(minWidth: c.maxWidth), child: Center(child: row)));
          }),
        ),
        LinearProgressIndicator(value: _overallPct / 100, minHeight: 3, borderRadius: BorderRadius.circular(2)),
      ]),
    );
  }

  List<Widget> _section(SectionDef s) {
    final fields = _fields(s);
    final done = _doneCount(s);
    final groups = s.groups;
    final comments = Map<String, dynamic>.from((_rec!['fieldComments'] ?? {}) as Map);
    Widget fw(FieldDef f) => _FieldCard(
          key: ValueKey('${f.key}-$_step'),
          f: f,
          a: _answers[f.key],
          error: _attempted.contains(s.id) ? validateField(f, _answers[f.key]) : null,
          reviewerComment: comments[f.key] as String?,
          onChange: (fn) => _set(f, fn),
          onPhoto: () => _addPhoto(f),
        );
    return [
      if (s.description.isNotEmpty) Text(s.description, style: Theme.of(context).textTheme.bodyMedium),
      Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text('$done of ${fields.length} complete', style: const TextStyle(fontWeight: FontWeight.bold))),
      for (final g in groups) ...[
        Padding(padding: const EdgeInsets.only(top: 8, bottom: 4), child: Text('${g['name']}', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: serpBlue))),
        ...fields.where((f) => f.groupId == g['id']).map(fw),
      ],
      ...fields.where((f) => f.groupId == null || !groups.any((g) => g['id'] == f.groupId)).map(fw),
    ];
  }

  Future<void> _addPhoto(FieldDef f) async {
    final a = _answers.putIfAbsent(f.key, () => Answer());
    if (a.photoUrls.length >= 3) return;
    final src = await showModalBottomSheet<ImageSource>(context: context, builder: (c) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
      ListTile(leading: const Icon(Icons.photo_camera), title: const Text('Camera'), onTap: () => Navigator.pop(c, ImageSource.camera)),
      ListTile(leading: const Icon(Icons.photo_library), title: const Text('Gallery'), onTap: () => Navigator.pop(c, ImageSource.gallery)),
    ])));
    if (src == null) return;
    try {
      final x = await ImagePicker().pickImage(source: src, maxWidth: 1600, maxHeight: 1600, imageQuality: 70);
      if (x == null) return;
      final bytes = await x.readAsBytes();
      final url = await _svc.uploadBytes('records/${widget.recordId}/photos/${f.key}/${DateTime.now().millisecondsSinceEpoch}.jpg', bytes, 'image/jpeg').timeout(const Duration(seconds: 30));
      setState(() => a.photoUrls.add(url));
      _changed();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Photo upload failed. Check your connection and try again.')));
    }
  }

  List<Widget> _review(List<SectionDef> secs) => [
        for (var i = 0; i < secs.length; i++) ...[
          Card(
            child: ListTile(
              onTap: () => _go(i),
              title: Text(secs[i].name),
              subtitle: Text('${_doneCount(secs[i])} of ${_fields(secs[i]).length} complete'),
              trailing: _missing(secs[i]).isEmpty ? const Icon(Icons.check_circle, color: Colors.green) : Icon(Icons.error, color: Theme.of(context).colorScheme.error),
            ),
          ),
          for (final f in _missing(secs[i]))
            Padding(padding: const EdgeInsets.only(left: 16, bottom: 4), child: InkWell(onTap: () { _attempted.add(secs[i].id); _go(i); }, child: Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text('• ${f.label}: ${validateField(f, _answers[f.key])}', style: TextStyle(color: Theme.of(context).colorScheme.error))))),
        ],
        const SizedBox(height: 12),
        TextFormField(initialValue: _remark, maxLines: 3, decoration: const InputDecoration(labelText: 'Overall remark (optional)'), onChanged: (v) { _remark = v; _changed(); }),
        const SizedBox(height: 12),
        const Text('Customer sign-off (optional)'),
        const SizedBox(height: 8),
        if (_signatureUrl != null && _ro) Container(color: Colors.white, child: Image.network(_signatureUrl!, height: 100)),
        if (!_ro) _SignaturePad(
          savedUrl: _signatureUrl,
          onClear: () { setState(() => _signatureUrl = null); _changed(); },
          onDone: (bytes) async {
          try {
            final url = await _svc.uploadBytes('records/${widget.recordId}/signature.png', bytes, 'image/png').timeout(const Duration(seconds: 30));
            setState(() => _signatureUrl = url);
            _changed();
          } catch (_) {
            if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Signature upload failed. Try again when online.')));
          }
        }),
      ];
}

DateTime _clampToday(DateTime? d) {
  final now = DateTime.now();
  return d == null || d.isAfter(now) ? now : d;
}

class _FieldCard extends StatelessWidget {
  final FieldDef f;
  final Answer? a;
  final String? error, reviewerComment;
  final void Function(void Function(Answer)) onChange;
  final VoidCallback onPhoto;
  const _FieldCard({super.key, required this.f, required this.a, required this.error, required this.reviewerComment, required this.onChange, required this.onPhoto});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final flagged = reviewerComment != null && reviewerComment!.isNotEmpty;
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: (error != null || flagged) ? cs.error : cs.outlineVariant, width: flagged ? 2 : 1)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${f.label}${f.required ? ' *' : ''}', style: Theme.of(context).textTheme.titleMedium),
          if (f.helpText.isNotEmpty) Text(f.helpText, style: Theme.of(context).textTheme.bodySmall),
          if (flagged) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Supervisor: $reviewerComment', style: TextStyle(color: cs.error, fontWeight: FontWeight.w600))),
          const SizedBox(height: 8),
          _input(context),
          if (f.allowNote && f.type != 'photo')
            Padding(padding: const EdgeInsets.only(top: 8), child: TextFormField(initialValue: a?.note ?? '', decoration: const InputDecoration(labelText: 'Note (optional)', isDense: true), onChanged: (v) => onChange((x) => x.note = v))),
          if (f.allowPhoto || f.type == 'photo') _photos(context),
          if (error != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(error!, style: TextStyle(color: cs.error))),
        ]),
      ),
    );
  }

  Widget _photos(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Wrap(spacing: 8, runSpacing: 8, children: [
          for (final u in a?.photoUrls ?? <String>[])
            Stack(children: [
              ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(u, width: 80, height: 80, fit: BoxFit.cover)),
              Positioned(right: 0, top: 0, child: InkWell(onTap: () => onChange((x) => x.photoUrls.remove(u)), child: const CircleAvatar(radius: 12, child: Icon(Icons.close, size: 14)))),
            ]),
          if ((a?.photoUrls.length ?? 0) < 3) OutlinedButton.icon(onPressed: onPhoto, icon: const Icon(Icons.add_a_photo), label: const Text('Photo')),
        ]),
      );

  Widget _input(BuildContext context) {
    switch (f.type) {
      case 'checklist':
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<String>(
              emptySelectionAllowed: true,
              style: ButtonStyle(minimumSize: WidgetStateProperty.all(const Size(48, 48))),
              segments: const [ButtonSegment(value: 'done', label: Text('Done')), ButtonSegment(value: 'not_done', label: Text('Not done')), ButtonSegment(value: 'na', label: Text('N/A'))],
              selected: a?.status == null ? {} : {a!.status!},
              onSelectionChanged: (s) => onChange((x) => x.status = s.isEmpty ? null : s.first),
            ),
          ),
          if (f.options.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 8), child: DropdownButtonFormField<String>(
              initialValue: f.options.contains(a?.value) ? a!.value as String : null,
              decoration: InputDecoration(labelText: f.placeholder.isEmpty ? 'Select option' : f.placeholder, isDense: true),
              items: [for (final o in f.options) DropdownMenuItem(value: o, child: Text(o))],
              onChanged: (v) => onChange((x) => x.value = v),
            )),
        ]);
      case 'dropdown':
        return DropdownButtonFormField<String>(
          initialValue: f.options.contains(a?.value) ? a!.value as String : null,
          items: [for (final o in f.options) DropdownMenuItem(value: o, child: Text(o))],
          onChanged: (v) => onChange((x) => x.value = v),
        );
      case 'multiselect':
        final sel = ((a?.value as List?) ?? []).map((e) => '$e').toSet();
        return Wrap(spacing: 8, children: [
          for (final o in f.options)
            FilterChip(label: Text(o), selected: sel.contains(o), onSelected: (v) => onChange((x) { final s = {...sel}; v ? s.add(o) : s.remove(o); x.value = s.toList(); })),
        ]);
      case 'toggle':
        return SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(a?.value == true ? 'Yes' : 'No'), value: a?.value == true, onChanged: (v) => onChange((x) => x.value = v));
      case 'date':
        return OutlinedButton.icon(
          icon: const Icon(Icons.calendar_today),
          label: Text('${a?.value ?? 'Pick a date'}'),
          onPressed: () async {
            final d = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime.now(), initialDate: _clampToday(DateTime.tryParse('${a?.value}')));
            if (d != null) onChange((x) => x.value = d.toIso8601String().substring(0, 10));
          },
        );
      case 'time':
        return OutlinedButton.icon(
          icon: const Icon(Icons.access_time),
          label: Text('${a?.value ?? 'Pick a time'}'),
          onPressed: () async {
            final t = await showTimePicker(context: context, initialTime: TimeOfDay.now());
            if (t != null && context.mounted) onChange((x) => x.value = t.format(context));
          },
        );
      case 'photo':
      case 'signature':
        return const SizedBox.shrink();
      default:
        return TextFormField(
          initialValue: a?.value == null ? '' : '${a!.value}',
          maxLines: f.type == 'longtext' ? 4 : 1,
          keyboardType: f.type == 'number' ? TextInputType.number : f.type == 'ip' ? TextInputType.number : TextInputType.text,
          decoration: InputDecoration(hintText: f.placeholder),
          onChanged: (v) => onChange((x) => x.value = v),
        );
    }
  }
}

class _SignaturePad extends StatefulWidget {
  final Future<void> Function(Uint8List png) onDone;
  final VoidCallback onClear;
  final String? savedUrl;
  const _SignaturePad({required this.onDone, required this.onClear, this.savedUrl});
  @override
  State<_SignaturePad> createState() => _SignaturePadState();
}

class _SignaturePadState extends State<_SignaturePad> {
  final List<List<Offset>> _strokes = [];
  final _box = GlobalKey();
  Timer? _auto;
  bool _saving = false;

  @override
  void dispose() {
    _auto?.cancel();
    super.dispose();
  }

  // Saves automatically shortly after the user stops drawing, so it is not lost if they skip the button.
  void _scheduleSave() {
    _auto?.cancel();
    _auto = Timer(const Duration(milliseconds: 1200), _save);
  }

  Future<void> _save() async {
    if (_strokes.isEmpty || _box.currentContext == null) return;
    setState(() => _saving = true);
    try {
      final size = (_box.currentContext!.findRenderObject() as RenderBox).size;
      final rec = ui.PictureRecorder();
      final c = Canvas(rec);
      c.drawRect(Offset.zero & size, Paint()..color = Colors.white);
      _paint(c);
      final img = await rec.endRecording().toImage(size.width.toInt(), size.height.toInt());
      final data = await img.toByteData(format: ui.ImageByteFormat.png);
      await widget.onDone(data!.buffer.asUint8List());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _paint(Canvas c) {
    final p = Paint()..color = Colors.black..strokeWidth = 3..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    for (final s in _strokes) {
      for (var i = 0; i < s.length - 1; i++) {
        c.drawLine(s[i], s[i + 1], p);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final saved = widget.savedUrl != null && _strokes.isNotEmpty && !_saving;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        key: _box,
        height: 180,
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: Colors.grey), borderRadius: BorderRadius.circular(8)),
        // The eager recognizer wins the gesture arena so dragging draws instead of scrolling the page.
        child: RawGestureDetector(
          gestures: {EagerGestureRecognizer: GestureRecognizerFactoryWithHandlers<EagerGestureRecognizer>(() => EagerGestureRecognizer(), (_) {})},
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerDown: (e) { _auto?.cancel(); setState(() => _strokes.add([e.localPosition])); },
            onPointerMove: (e) => setState(() => _strokes.last.add(e.localPosition)),
            onPointerUp: (_) => _scheduleSave(),
            child: ClipRect(child: CustomPaint(size: Size.infinite, painter: _SigPainter(_strokes, _paint))),
          ),
        ),
      ),
      Row(children: [
        TextButton.icon(
          icon: const Icon(Icons.clear),
          label: const Text('Clear'),
          onPressed: () { _auto?.cancel(); setState(_strokes.clear); widget.onClear(); },
        ),
        const Spacer(),
        if (_saving) const Text('Saving…') else if (saved) const Row(children: [Icon(Icons.check_circle, size: 18, color: Colors.green), SizedBox(width: 4), Text('Signature saved')]),
      ]),
    ]);
  }
}

class _SigPainter extends CustomPainter {
  final List<List<Offset>> strokes;
  final void Function(Canvas) draw;
  _SigPainter(this.strokes, this.draw);
  @override
  void paint(Canvas canvas, Size size) => draw(canvas);
  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
