import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_service.dart';
import '../services/record_service.dart';
import 'profile_screen.dart';
import 'records_screen.dart';
import 'wizard_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final svc = context.read<RecordService>();
    final hour = DateTime.now().hour;
    final greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return Scaffold(
      appBar: AppBar(title: const Text('SERP POS'), actions: [
        IconButton(tooltip: 'Profile', icon: const Icon(Icons.account_circle), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()))),
      ]),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: svc.watchMine(),
        builder: (context, snap) {
          final docs = (snap.data?.docs ?? []).where((d) => d.data()['deleted'] != true).toList();
          int c(String s) => docs.where((d) => d.data()['status'] == s).length;
          final pending = snap.data?.metadata.hasPendingWrites ?? false;
          return ListView(padding: const EdgeInsets.all(16), children: [
            Text('$greet, ${auth.fullName}', style: Theme.of(context).textTheme.headlineSmall),
            if (pending || (snap.data?.metadata.isFromCache ?? false))
              Padding(padding: const EdgeInsets.only(top: 8), child: Chip(avatar: const Icon(Icons.sync, size: 16), label: Text(pending ? 'Waiting to sync' : 'Offline data'))),
            const SizedBox(height: 16),
            GridView.count(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: 2, childAspectRatio: 1.7, mainAxisSpacing: 12, crossAxisSpacing: 12, children: [
              _stat(context, 'Draft', c('draft'), Icons.edit_note, 'draft'),
              _stat(context, 'Pending review', c('submitted'), Icons.hourglass_top, 'submitted'),
              _stat(context, 'Returned', c('returned'), Icons.undo, 'returned'),
              _stat(context, 'Approved', c('approved'), Icons.verified, 'approved'),
            ]),
            const SizedBox(height: 24),
            SizedBox(height: 72, child: FilledButton.icon(icon: const Icon(Icons.add, size: 28), label: const Text('New Installation', style: TextStyle(fontSize: 18)), onPressed: () => _new(context))),
            const SizedBox(height: 12),
            OutlinedButton.icon(icon: const Icon(Icons.list), label: const Text('My Records'), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RecordsScreen()))),
          ]);
        },
      ),
    );
  }

  Widget _stat(BuildContext context, String label, int n, IconData icon, String status) => Card(
        child: InkWell(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => RecordsScreen(initialStatus: status))),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(children: [
              Icon(icon, size: 28),
              const SizedBox(width: 10),
              Expanded(
                child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('$n', style: Theme.of(context).textTheme.headlineSmall),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, softWrap: false),
                ]),
              ),
            ]),
          ),
        ),
      );

  Future<void> _new(BuildContext context) async {
    final svc = context.read<RecordService>();
    final nav = Navigator.of(context);
    try {
      final t = await svc.latestTemplate();
      if (t.sections.isEmpty) throw 'No checklist has been published yet';
      final id = await svc.createDraft(t);
      nav.push(MaterialPageRoute(builder: (_) => WizardScreen(recordId: id)));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not start: $e')));
    }
  }
}
