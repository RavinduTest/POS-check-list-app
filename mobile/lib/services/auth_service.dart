import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

class AuthService extends ChangeNotifier {
  final _auth = FirebaseAuth.instance;
  User? user;
  String role = '';
  String fullName = '';
  String username = '';
  bool mustChangePassword = false;
  bool ready = false;

  AuthService() {
    _auth.authStateChanges().listen((u) async {
      user = u;
      if (u != null) {
        try {
          await _load(u);
        } catch (_) {
          await logout();
        }
      }
      ready = true;
      notifyListeners();
    });
  }

  Future<void> _load(User u) async {
    final tok = await u.getIdTokenResult(true);
    if (tok.claims?['active'] != true || tok.claims?['role'] == null) {
      await _auth.signOut();
      user = null;
      return;
    }
    role = tok.claims!['role'] as String;
    final d = await FirebaseFirestore.instance.doc('users/${u.uid}').get();
    fullName = (d.data()?['fullName'] ?? u.displayName ?? '') as String;
    username = (d.data()?['username'] ?? '') as String;
    mustChangePassword = d.data()?['mustChangePassword'] == true;
  }

  Future<void> login(String username, String password) async {
    final email = '${username.trim().toLowerCase()}@serp-pos.local';
    final cred = await _auth.signInWithEmailAndPassword(email: email, password: password);
    final tok = await cred.user!.getIdTokenResult(true);
    if (tok.claims?['active'] != true) {
      await _auth.signOut();
      throw 'Account is deactivated';
    }
    await _load(cred.user!);
    user = cred.user;
    _call('markLogin', {});
    notifyListeners();
  }

  Future<void> changePassword(String current, String next) async {
    final u = _auth.currentUser!;
    await u.reauthenticateWithCredential(EmailAuthProvider.credential(email: u.email!, password: current));
    await u.updatePassword(next);
    await FirebaseFunctions.instance.httpsCallable('markLogin').call({'passwordChanged': true});
    mustChangePassword = false;
    notifyListeners();
  }

  void _call(String name, Map<String, dynamic> data) {
    FirebaseFunctions.instance.httpsCallable(name).call(data).then((_) {}, onError: (_) {});
  }

  Future<void> logout() async {
    await _auth.signOut();
    user = null;
    notifyListeners();
  }
}

String? passwordPolicyError(String p) {
  if (p.length < 8) return 'At least 8 characters';
  if (!RegExp(r'[A-Za-z]').hasMatch(p) || !RegExp(r'\d').hasMatch(p)) return 'Must include a letter and a number';
  return null;
}

String friendlyAuthError(Object e) {
  if (e is FirebaseAuthException) {
    switch (e.code) {
      case 'invalid-credential':
      case 'wrong-password':
      case 'user-not-found':
      case 'invalid-email':
        return 'Invalid username or password';
      case 'user-disabled':
        return 'Account is deactivated';
      case 'too-many-requests':
        return 'Too many attempts. Try again in a few minutes';
      case 'network-request-failed':
        return 'No internet connection';
    }
    return e.message ?? e.code;
  }
  return '$e';
}
