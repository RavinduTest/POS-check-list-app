import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/record_service.dart';
import 'wizard_screen.dart';

const statusLabels = {'draft': 'Draft', 'submitted': 'Pending review', 'returned': 'Returned', 'approved': 'Approved'};
Color statusColor(String s) => switch (s) { 'approved' => Colors.green, 'returned' => Colors.red, 'submitted' => Colors.orange, _ => Colors.grey };

class RecordsScreen extends StatefulWidget {
  final String? initialStatus;
  const RecordsScreen({super.key, this.initialStatus});
  @override
  State<RecordsScreen> createState() => _RecordsScreenState();
}

class _RecordsScreenState extends State<RecordsScreen> {
  String? _status;
  String _preset = 'all';
  DateTimeRange? _custom;
  String _q = '';
  int _shown = 20;

  @override
  void initState() {
    super.initState();
    _status = widget.initialStatus;
  }

  DateTime? get _from {
    final n = DateTime.now(), today = DateTime(n.year, n.month, n.day);
    return switch (_preset) { 'today' => today, 'week' => today.subtract(const Duration(days: 7)), 'month' => DateTime(n.year, n.month), 'custom' => _custom?.start, _ => null };
  }

  @override
  Widget build(BuildContext context) {
    final svc = context.read<RecordService>();
    return Scaffold(
      appBar: AppBar(title: const Text('My Records')),
      body: Column(children: [
        Padding(padding: const EdgeInsets.all(12), child: TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search company, branch, terminal'), onChanged: (v) => setState(() => _q = v.toLowerCase()))),
        SizedBox(height: 48, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
          for (final p in const {'all': 'All', 'today': 'Today', 'week': 'Last 7 days', 'month': 'This month', 'custom': 'Custom'}.entries)
            Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(p.value), selected: _preset == p.key, onSelected: (_) async {
              if (p.key == 'custom') {
                final r = await showDateRangePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime.now().add(const Duration(days: 1)));
                if (r == null) return;
                _custom = r;
              }
              setState(() => _preset = p.key);
            })),
          const VerticalDivider(),
          for (final s in statusLabels.entries)
            Padding(padding: const EdgeInsets.only(left: 8), child: FilterChip(label: Text(s.value), selected: _status == s.key, onSelected: (v) => setState(() => _status = v ? s.key : null))),
        ])),
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: svc.watchMine(),
            builder: (context, snap) {
              if (snap.hasError) return Center(child: Text('Could not load records\n${snap.error}'));
              if (!snap.hasData) return ListView(children: List.generate(5, (_) => const ListTile(title: LinearProgressIndicator())));
              final from = _from;
              final rows = snap.data!.docs.where((d) {
                final m = d.data();
                if (m['deleted'] == true) return false;
                if (_status != null && m['status'] != _status) return false;
                if (from != null) {
                  final c = (m['createdAt'] as Timestamp?)?.toDate();
                  if (c != null && c.isBefore(from)) return false;
                  if (_preset == 'custom' && c != null && c.isAfter(_custom!.end.add(const Duration(days: 1)))) return false;
                }
                return _q.isEmpty || '${m['company']} ${m['branch']} ${m['terminalId']}'.toLowerCase().contains(_q);
              }).toList();
              if (rows.isEmpty) return const Center(child: Padding(padding: EdgeInsets.all(32), child: Text('No records found. Tap New Installation on the home screen to start one.', textAlign: TextAlign.center)));
              return RefreshIndicator(
                onRefresh: () async => setState(() => _shown = 20),
                child: ListView.builder(
                  itemCount: rows.length > _shown ? _shown + 1 : rows.length,
                  itemBuilder: (_, i) {
                    if (i == _shown) return TextButton(onPressed: () => setState(() => _shown += 20), child: const Text('Load more'));
                    final d = rows[i], m = d.data(), st = m['status'] as String;
                    return ListTile(
                      title: Text('${m['company'] ?? ''}'.isEmpty ? '(untitled)' : '${m['company']} · ${m['branch'] ?? ''}'),
                      subtitle: Text('Terminal ${m['terminalId'] ?? '-'} · ${m['installDate'] ?? ''}${d.metadata.hasPendingWrites ? ' · Waiting to sync' : ''}'),
                      trailing: Chip(label: Text(statusLabels[st] ?? st), side: BorderSide(color: statusColor(st))),
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => WizardScreen(recordId: d.id, readOnly: st != 'draft' && st != 'returned'))),
                    );
                  },
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}
