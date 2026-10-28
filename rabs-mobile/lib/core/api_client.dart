import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config.dart';
import 'auth_state.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.apiBase,
    connectTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(seconds: 45),
    headers: {'Accept': 'application/json'},
  ));

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      final auth = ref.read(authProvider);
      final token = auth.accessToken;
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      handler.next(options);
    },
    onError: (err, handler) async {
      if (err.response?.statusCode == 401) {
        final refreshed = await ref.read(authProvider.notifier).tryRefresh();
        if (refreshed) {
          final req = err.requestOptions;
          req.headers['Authorization'] = 'Bearer ${ref.read(authProvider).accessToken}';
          try {
            final clone = await dio.fetch(req);
            return handler.resolve(clone);
          } catch (_) {}
        }
      }
      handler.next(err);
    },
  ));

  return dio;
});

class ApiException implements Exception {
  ApiException(this.message, {this.status});
  final String message;
  final int? status;
  @override
  String toString() => message;
}

String apiErrorMessage(Object e, [String fallback = 'Something went wrong. Please try again.']) {
  if (e is ApiException) return e.message;
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map && data['error']['message'] != null) {
      return data['error']['message'].toString();
    }
    if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
      return 'Cannot reach the server — check your connection.';
    }
  }
  return fallback;
}

extension RabsDio on Dio {
  Future<dynamic> rabsGet(String path, {Map<String, dynamic>? query}) async {
    try {
      final r = await get('/api/rabs$path', queryParameters: query);
      return r.data;
    } on DioException catch (e) {
      throw ApiException(apiErrorMessage(e), status: e.response?.statusCode);
    }
  }

  Future<dynamic> rabsPost(String path, {Object? data}) async {
    try {
      final r = await post('/api/rabs$path', data: data ?? {});
      return r.data;
    } on DioException catch (e) {
      throw ApiException(apiErrorMessage(e), status: e.response?.statusCode);
    }
  }

  Future<dynamic> rabsPut(String path, {Object? data}) async {
    try {
      final r = await put('/api/rabs$path', data: data ?? {});
      return r.data;
    } on DioException catch (e) {
      throw ApiException(apiErrorMessage(e), status: e.response?.statusCode);
    }
  }

  Future<dynamic> rabsPatch(String path, {Object? data}) async {
    try {
      final r = await patch('/api/rabs$path', data: data ?? {});
      return r.data;
    } on DioException catch (e) {
      throw ApiException(apiErrorMessage(e), status: e.response?.statusCode);
    }
  }

  Future<dynamic> rabsUpload(String path, List<MultipartFile> files, {Map<String, dynamic>? fields}) async {
    try {
      final form = FormData();
      for (final f in files) {
        form.files.add(MapEntry('files', f));
      }
      fields?.forEach((k, v) => form.fields.add(MapEntry(k, v.toString())));
      final r = await post('/api/rabs$path', data: form);
      return r.data;
    } on DioException catch (e) {
      throw ApiException(apiErrorMessage(e), status: e.response?.statusCode);
    }
  }

  Future<dynamic> portalGet(String path, {Map<String, dynamic>? query}) async {
    try {
      final r = await get('/api/rabs/portal$path', queryParameters: query);
      return r.data;
    } on DioException catch (e) {
      throw ApiException(apiErrorMessage(e), status: e.response?.statusCode);
    }
  }

  Future<dynamic> portalPost(String path, {Object? data}) async {
    try {
      final r = await post('/api/rabs/portal$path', data: data ?? {});
      return r.data;
    } on DioException catch (e) {
      throw ApiException(apiErrorMessage(e), status: e.response?.statusCode);
    }
  }
}
