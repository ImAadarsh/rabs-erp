import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'auth_state.dart';

/// Cached `/api/rabs/meta` for room types, products, accessories, staff, statuses.
final rabsMetaProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final auth = ref.watch(authProvider);
  if (!auth.isLoggedIn || auth.user?.isPortal == true) return null;
  final dio = ref.read(dioProvider);
  final meta = await dio.rabsGet('/meta');
  return meta is Map<String, dynamic> ? meta : Map<String, dynamic>.from(meta as Map);
});

List<Map<String, dynamic>> metaProducts(Map<String, dynamic>? meta, {String? kind}) {
  final list = (meta?['products'] as List?) ?? [];
  return list
      .cast<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .where((p) => kind == null || p['kind'] == kind)
      .toList();
}

List<String> metaRoomTypes(Map<String, dynamic>? meta) {
  final list = (meta?['roomTypes'] as List?) ?? [];
  return list.map((e) => '$e').toList();
}

List<Map<String, dynamic>> metaStaff(Map<String, dynamic>? meta) {
  final list = (meta?['staff'] as List?) ?? [];
  return list.cast<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
}
