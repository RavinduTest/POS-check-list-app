import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../main.dart';
import '../services/auth_service.dart';
import 'change_password_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final a = context.watch<AuthService>();
    final theme = context.watch<ThemeController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(children: [
        ListTile(leading: const Icon(Icons.badge), title: Text(a.fullName), subtitle: const Text('Name')),
        ListTile(leading: const Icon(Icons.person), title: Text(a.username), subtitle: const Text('Username')),
        ListTile(leading: const Icon(Icons.security), title: Text(a.role.replaceAll('_', ' ')), subtitle: const Text('Role')),
        ListTile(leading: const Icon(Icons.password), title: const Text('Change password'), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChangePasswordScreen()))),
        const Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, 8), child: Text('Theme')),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SegmentedButton<ThemeMode>(
            segments: const [ButtonSegment(value: ThemeMode.light, label: Text('Light')), ButtonSegment(value: ThemeMode.dark, label: Text('Dark')), ButtonSegment(value: ThemeMode.system, label: Text('System'))],
            selected: {theme.mode},
            onSelectionChanged: (s) => theme.set(s.first),
          ),
        ),
        const SizedBox(height: 24),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: FilledButton.tonalIcon(icon: const Icon(Icons.logout), label: const Text('Logout'), onPressed: () { Navigator.popUntil(context, (r) => r.isFirst); a.logout(); })),
      ]),
    );
  }
}
