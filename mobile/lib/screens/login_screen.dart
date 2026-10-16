import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_service.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _u = TextEditingController(), _p = TextEditingController();
  bool _busy = false, _hide = true;
  String? _err;

  Future<void> _go() async {
    setState(() { _busy = true; _err = null; });
    try {
      await context.read<AuthService>().login(_u.text, _p.text);
    } catch (e) {
      if (mounted) setState(() => _err = friendlyAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Icon(Icons.point_of_sale, size: 72, color: serpBlue),
                  const SizedBox(height: 8),
                  Text('SERP POS Installation Tracker', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 32),
                  TextField(controller: _u, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'Username', prefixIcon: Icon(Icons.person))),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _p,
                    obscureText: _hide,
                    onSubmitted: (_) => _go(),
                    decoration: InputDecoration(labelText: 'Password', prefixIcon: const Icon(Icons.lock), suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility : Icons.visibility_off), onPressed: () => setState(() => _hide = !_hide))),
                  ),
                  if (_err != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_err!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                  const SizedBox(height: 24),
                  FilledButton(onPressed: _busy ? null : _go, child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Sign in')),
                ]),
              ),
            ),
          ),
        ),
      );
}
