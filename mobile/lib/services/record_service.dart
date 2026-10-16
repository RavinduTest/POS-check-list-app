import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:geolocator/geolocator.dart';

import '../firebase_options.dart';
import '../models.dart';
import 'auth_service.dart';

class RecordService {
  final AuthService auth;
  RecordService(this.auth);
  final _db = FirebaseFirestore.instance;

  CollectionReference<Json> get _records => _db.collection('records');

  /// Latest published template (cached for offline use by Firestore persistence).
  Future<Template> latestTemplate() async {
    final cfg = await _db.doc('config/app').get();
    final v = (cfg.data()?['currentVersion'] ?? 1) as int;
    return templateVersion(v);
  }

  Future<Template> templateVersion(int v) async {
    final d = await _db.doc('templateVersions/$v').get();
    return Template(v, d.data() ?? {'sections': []});
  }

  Stream<QuerySnapshot<Json>> watchMine() =>
      _records.where('technicianId', isEqualTo: auth.user!.uid).orderBy('createdAt', descending: true).limit(100).snapshots();

  Future<DocumentSnapshot<Json>> watchOne(String id) => _records.doc(id).get();

  Future<String> createDraft(Template t) async {
    final ref = _records.doc();
    await ref.set({
      'templateVersion': t.version,
      'status': 'draft',
      'technicianId': auth.user!.uid,
      'technicianName': auth.fullName,
      'company': '', 'branch': '', 'terminalId': '', 'anydeskNo': '',
      'installDate': DateTime.now().toIso8601String().substring(0, 10),
      'answers': <String, dynamic>{},
      'completionPct': 0,
      'deleted': false,
      'appVersion': Env.appVersion,
      'startedAt': FieldValue.serverTimestamp(),
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
      'updatedBy': auth.user!.uid,
      'updatedByName': auth.fullName,
    });
    return ref.id;
  }

  Future<void> save(String id, Json data) => _records.doc(id).update({
        ...data,
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': auth.user!.uid,
        'updatedByName': auth.fullName,
      });

  Future<void> submit(String id, Json data) => save(id, {...data, 'status': 'submitted', 'submittedAt': FieldValue.serverTimestamp()});

  /// Rules forbid hard deletes, so a discarded draft is soft-deleted (not awaited: works offline).
  Future<void> discard(String id) async {
    _records.doc(id).update({'deleted': true, 'deletedAt': FieldValue.serverTimestamp()}).catchError((_) {});
  }

  /// MOB-22: same company + branch + terminal among my own records.
  Future<bool> hasDuplicate(String id, String company, String branch, String terminal) async {
    final s = await _records.where('technicianId', isEqualTo: auth.user!.uid).get();
    return s.docs.any((d) =>
        d.id != id &&
        d.data()['deleted'] != true &&
        d.data()['status'] != 'draft' &&
        (d.data()['company'] ?? '').toString().toLowerCase() == company.toLowerCase() &&
        (d.data()['branch'] ?? '').toString().toLowerCase() == branch.toLowerCase() &&
        (d.data()['terminalId'] ?? '').toString().toLowerCase() == terminal.toLowerCase());
  }

  Future<String> uploadBytes(String path, Uint8List bytes, String contentType) async {
    final ref = FirebaseStorage.instance.ref(path);
    await ref.putData(bytes, SettableMetadata(contentType: contentType));
    return ref.getDownloadURL();
  }

  Future<Json?> location() async {
    try {
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      if (p == LocationPermission.denied || p == LocationPermission.deniedForever) return null;
      final pos = await Geolocator.getCurrentPosition().timeout(const Duration(seconds: 8));
      return {'lat': pos.latitude, 'lng': pos.longitude};
    } catch (_) {
      return null;
    }
  }
}
