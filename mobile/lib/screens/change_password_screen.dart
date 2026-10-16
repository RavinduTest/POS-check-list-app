import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_service.dart';

class ChangePasswordScreen extends StatefulWidget {
  final bool forced;
  const ChangePasswordScreen({super.key, this.forced = false});
  @override
  State<ChangePasswordScreen> createState() => _State();
}

class _State extends State<ChangePasswordScreen> {
  final _cur = TextEditingController(), _new = TextEditingController(), _conf = TextEditingController();
  String? _err;
  bool _busy = false;

  Future<void> _save() async {
    final pe = passwordPolicyError(_new.text);
    if (pe != null) return setState(() => _err = pe);
    if (_new.text != _conf.text) return setState(() => _err = 'Passwords do not match');
    setState(() { _busy = true; _err = null; });
    try {
      await context.read<AuthService>().changePassword(_cur.text, _new.text);
      if (mounted && !widget.forced) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password changed')));
      }
    } catch (e) {
      if (mounted) setState(() => _err = friendlyAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Change password'), automaticallyImplyLeading: !widget.forced, actions: [
          if (widget.forced) TextButton(onPressed: () => context.read<AuthService>().logout(), child: const Text('Logout')),
        ]),
        body: ListView(padding: const EdgeInsets.all(24), children: [
          if (widget.forced) const Padding(padding: EdgeInsets.only(bottom: 16), child: Text('You must change your temporary password before continuing.')),
          TextField(controller: _cur, obscureText: true, decoration: const InputDecoration(labelText: 'Current (temporary) password')),
          const SizedBox(height: 16),
          TextField(controller: _new, obscureText: true, decoration: const InputDecoration(labelText: 'New password', helperText: 'Min 8 characters, with a letter and a number')),
          const SizedBox(height: 16),
          TextField(controller: _conf, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm new password')),
          if (_err != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_err!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 24),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Save password')),
        ]),
      );
}
