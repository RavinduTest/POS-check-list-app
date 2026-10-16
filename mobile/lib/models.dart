/// Lightweight accessors over the template maps stored in Firestore.
typedef Json = Map<String, dynamic>;

class FieldDef {
  final Json raw;
  FieldDef(this.raw);
  String get key => raw['key'] as String;
  String get label => (raw['label'] ?? '') as String;
  String get type => (raw['type'] ?? 'text') as String;
  bool get required => raw['required'] == true;
  bool get hidden => raw['hidden'] == true;
  bool get allowNote => raw['allowNote'] == true;
  bool get allowPhoto => raw['allowPhoto'] == true;
  String get helpText => (raw['helpText'] ?? '') as String;
  String get placeholder => (raw['placeholder'] ?? '') as String;
  String? get groupId => raw['groupId'] as String?;
  String? get role => raw['role'] as String?;
  List<String> get options => ((raw['options'] ?? []) as List).map((e) => '$e').toList();
  Json get validation => Map<String, dynamic>.from((raw['validation'] ?? {}) as Map);
  Json? get visibleIf => raw['visibleIf'] == null ? null : Map<String, dynamic>.from(raw['visibleIf'] as Map);
  dynamic get defaultValue => raw['defaultValue'];
  int get order => (raw['order'] ?? 0) as int;
}

class SectionDef {
  final Json raw;
  final List<FieldDef> fields;
  SectionDef(this.raw)
      : fields = (((raw['fields'] ?? []) as List).map((f) => FieldDef(Map<String, dynamic>.from(f as Map))).toList()
          ..sort((a, b) => a.order.compareTo(b.order)));
  String get id => raw['id'] as String;
  String get name => (raw['name'] ?? '') as String;
  String get description => (raw['description'] ?? '') as String;
  String get icon => (raw['icon'] ?? '') as String;
  bool get hidden => raw['hidden'] == true;
  List<Json> get groups => ((raw['groups'] ?? []) as List).map((g) => Map<String, dynamic>.from(g as Map)).toList();
  List<FieldDef> get visibleFields => fields.where((f) => !f.hidden).toList();
}

class Template {
  final int version;
  final List<SectionDef> sections;
  Template(this.version, Json data)
      : sections = (((data['sections'] ?? []) as List).map((s) => SectionDef(Map<String, dynamic>.from(s as Map))).where((s) => !s.hidden).toList()
          ..sort((a, b) => (a.raw['order'] ?? 0).compareTo(b.raw['order'] ?? 0)));
}

class Answer {
  String? status; // done | not_done | na
  dynamic value;
  String note;
  List<String> photoUrls;
  Answer({this.status, this.value, this.note = '', List<String>? photoUrls}) : photoUrls = photoUrls ?? [];

  factory Answer.fromJson(Json j) => Answer(
        status: j['status'] as String?,
        value: j['value'],
        note: (j['note'] ?? '') as String,
        photoUrls: ((j['photoUrls'] ?? []) as List).map((e) => '$e').toList(),
      );

  Json toJson() => {
        if (status != null) 'status': status,
        if (value != null) 'value': value,
        if (note.isNotEmpty) 'note': note,
        if (photoUrls.isNotEmpty) 'photoUrls': photoUrls,
      };

  bool get isEmpty => status == null && (value == null || value == '' || (value is List && (value as List).isEmpty));
}

/// Returns an error message, or null if the answer is valid.
String? validateField(FieldDef f, Answer? a) {
  final empty = a == null || a.isEmpty;
  if (f.type == 'checklist') {
    if (f.required && (a?.status == null)) return 'Choose Done, Not done or N/A';
    if (a?.status == 'done' && f.options.isNotEmpty && f.required && (a?.value == null || a?.value == '')) return 'Select ${f.label} option';
    return null;
  }
  if (f.type == 'photo') return f.required && (a == null || a.photoUrls.isEmpty) ? 'Photo required' : null;
  if (empty) return f.required ? 'Required' : null;
  final v = a.value;
  final val = f.validation;
  final s = '$v';
  if (val['minLength'] != null && s.length < (val['minLength'] as num)) return 'Min ${val['minLength']} characters';
  if (val['maxLength'] != null && s.length > (val['maxLength'] as num)) return 'Max ${val['maxLength']} characters';
  if (f.type == 'number') {
    final n = num.tryParse(s);
    if (n == null) return 'Enter a number';
    if (val['min'] != null && n < (val['min'] as num)) return 'Minimum ${val['min']}';
    if (val['max'] != null && n > (val['max'] as num)) return 'Maximum ${val['max']}';
  }
  if (f.type == 'date') {
    final d = DateTime.tryParse(s);
    if (d == null) return 'Enter a valid date';
    final n = DateTime.now();
    if (d.isAfter(DateTime(n.year, n.month, n.day))) return 'Date cannot be in the future';
  }
  if (f.type == 'ip' && !RegExp(r'^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$').hasMatch(s)) return 'Invalid IP address';
  if (val['regex'] != null && !RegExp(val['regex'] as String).hasMatch(s)) return (val['message'] ?? 'Invalid format') as String;
  return null;
}

bool isVisible(FieldDef f, Map<String, Answer> answers) {
  final c = f.visibleIf;
  if (c == null) return true;
  final a = answers[c['fieldKey']];
  if (a == null) return false;
  final eq = '${c['equals']}';
  return a.status == eq || '${a.value}' == eq;
}
