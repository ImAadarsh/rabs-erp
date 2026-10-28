/// API base URL. Override at build time:
/// `flutter run --dart-define=API_BASE=https://api.rabsinteriors.app`
class AppConfig {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://api.rabsinteriors.app',
  );

  static String get iamBase => '$apiBase/api/iam';
  static String get rabsBase => '$apiBase/api/rabs';
  static String get portalBase => '$apiBase/api/rabs/portal';
}
