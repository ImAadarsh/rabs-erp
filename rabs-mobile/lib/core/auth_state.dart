import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'config.dart';

enum AppRoleHome { field, staff, customer, none }

class AuthUser {
  AuthUser({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.roles,
    required this.capabilities,
    this.isPortal = false,
    this.customerName,
    this.rabsCustomerId,
  });

  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final List<String> roles;
  final Set<String> capabilities;
  final bool isPortal;
  final String? customerName;
  final String? rabsCustomerId;

  String get displayName {
    final n = [firstName, lastName].where((s) => s.trim().isNotEmpty).join(' ');
    if (n.isNotEmpty) return n;
    return customerName ?? email;
  }

  bool can(String cap) => capabilities.contains(cap);

  AppRoleHome get home {
    if (isPortal) return AppRoleHome.customer;
    final upper = roles.map((r) => r.toUpperCase()).toSet();
    final fieldOnly = (upper.contains('FITTER') || upper.contains('DRIVER')) &&
        !can('customers') &&
        !can('quotes');
    if (fieldOnly || (can('fieldwork') && !can('customers') && !can('quotes'))) {
      return AppRoleHome.field;
    }
    if (can('customers') || can('quotes') || can('appointments') || can('measure') || can('admin')) {
      return AppRoleHome.staff;
    }
    if (can('fieldwork')) return AppRoleHome.field;
    return AppRoleHome.staff;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'firstName': firstName,
        'lastName': lastName,
        'roles': roles,
        'capabilities': capabilities.toList(),
        'isPortal': isPortal,
        'customerName': customerName,
        'rabsCustomerId': rabsCustomerId,
      };

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: '${j['id']}',
        email: '${j['email'] ?? ''}',
        firstName: '${j['firstName'] ?? ''}',
        lastName: '${j['lastName'] ?? ''}',
        roles: (j['roles'] as List? ?? []).map((e) => '$e').toList(),
        capabilities: (j['capabilities'] as List? ?? []).map((e) => '$e').toSet(),
        isPortal: j['isPortal'] == true,
        customerName: j['customerName'] as String?,
        rabsCustomerId: j['rabsCustomerId']?.toString(),
      );
}

class AuthState {
  const AuthState({
    this.accessToken,
    this.refreshToken,
    this.user,
    this.ready = false,
  });

  final String? accessToken;
  final String? refreshToken;
  final AuthUser? user;
  final bool ready;

  bool get isLoggedIn => accessToken != null && user != null;

  AuthState copyWith({
    String? accessToken,
    String? refreshToken,
    AuthUser? user,
    bool? ready,
    bool clearUser = false,
  }) =>
      AuthState(
        accessToken: accessToken ?? this.accessToken,
        refreshToken: refreshToken ?? this.refreshToken,
        user: clearUser ? null : (user ?? this.user),
        ready: ready ?? this.ready,
      );
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    _restore();
  }

  final _storage = const FlutterSecureStorage();
  static const _kAccess = 'rabs_access';
  static const _kRefresh = 'rabs_refresh';
  static const _kUser = 'rabs_user';

  Future<void> _restore() async {
    try {
      final access = await _storage.read(key: _kAccess);
      final refresh = await _storage.read(key: _kRefresh);
      final raw = await _storage.read(key: _kUser);
      AuthUser? user;
      if (raw != null) {
        user = AuthUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      }
      state = AuthState(accessToken: access, refreshToken: refresh, user: user, ready: true);
    } catch (_) {
      state = const AuthState(ready: true);
    }
  }

  Future<void> _persist() async {
    if (state.accessToken == null) {
      await _storage.deleteAll();
      return;
    }
    await _storage.write(key: _kAccess, value: state.accessToken);
    await _storage.write(key: _kRefresh, value: state.refreshToken);
    if (state.user != null) {
      await _storage.write(key: _kUser, value: jsonEncode(state.user!.toJson()));
    }
  }

  Future<void> loginStaff(String email, String password) async {
    try {
      final dio = Dio(BaseOptions(baseUrl: AppConfig.apiBase));
      final res = await dio.post('/api/iam/auth/login', data: {
        'email': email.trim(),
        'password': password,
      });
      final data = res.data as Map<String, dynamic>;
      final access = data['accessToken'] as String;
      final refresh = data['refreshToken'] as String;
      final u = data['user'] as Map<String, dynamic>;

      final caps = await _loadCaps(access);
      final user = AuthUser(
        id: '${u['id']}',
        email: '${u['email']}',
        firstName: '${u['firstName'] ?? ''}',
        lastName: '${u['lastName'] ?? ''}',
        roles: (u['roles'] as List? ?? []).map((e) => '$e').toList(),
        capabilities: caps,
      );
      state = AuthState(accessToken: access, refreshToken: refresh, user: user, ready: true);
      await _persist();
    } on DioException catch (e) {
      final msg = e.response?.data is Map && (e.response!.data as Map)['error'] is Map
          ? '${(e.response!.data as Map)['error']['message']}'
          : 'Login failed';
      throw Exception(msg);
    }
  }

  Future<Set<String>> _loadCaps(String access) async {
    try {
      final dio = Dio(BaseOptions(
        baseUrl: AppConfig.apiBase,
        headers: {'Authorization': 'Bearer $access'},
      ));
      final meta = await dio.get('/api/rabs/meta');
      final me = meta.data['me'] as Map<String, dynamic>?;
      final perms = me?['permissions'] as List? ?? [];
      return perms.map((e) => '$e').toSet();
    } catch (_) {
      return {};
    }
  }

  Future<void> requestPortalOtp(String phoneOrEmail) async {
    final dio = Dio(BaseOptions(baseUrl: AppConfig.apiBase));
    await dio.post('/api/rabs/portal/request-otp', data: {'identifier': phoneOrEmail.trim()});
  }

  Future<void> verifyPortalOtp(String phoneOrEmail, String code) async {
    final dio = Dio(BaseOptions(baseUrl: AppConfig.apiBase));
    final res = await dio.post('/api/rabs/portal/verify-otp', data: {
      'identifier': phoneOrEmail.trim(),
      'code': code.trim(),
    });
    final data = res.data as Map<String, dynamic>;
    final access = data['accessToken'] as String;
    final c = data['customer'] as Map<String, dynamic>;
    final user = AuthUser(
      id: '${c['id']}',
      email: '${c['email'] ?? ''}',
      firstName: '',
      lastName: '',
      roles: const ['CUSTOMER'],
      capabilities: const {},
      isPortal: true,
      customerName: '${c['name'] ?? 'Customer'}',
      rabsCustomerId: '${c['id']}',
    );
    state = AuthState(accessToken: access, refreshToken: null, user: user, ready: true);
    await _persist();
  }

  Future<bool> tryRefresh() async {
    final refresh = state.refreshToken;
    if (refresh == null || state.user?.isPortal == true) return false;
    try {
      final dio = Dio(BaseOptions(baseUrl: AppConfig.apiBase));
      final res = await dio.post('/api/iam/auth/refresh', data: {'refreshToken': refresh});
      final data = res.data as Map<String, dynamic>;
      state = state.copyWith(
        accessToken: data['accessToken'] as String,
        refreshToken: (data['refreshToken'] as String?) ?? refresh,
      );
      await _persist();
      return true;
    } catch (_) {
      await logout();
      return false;
    }
  }

  Future<void> logout() async {
    state = const AuthState(ready: true);
    await _storage.deleteAll();
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) => AuthNotifier());
