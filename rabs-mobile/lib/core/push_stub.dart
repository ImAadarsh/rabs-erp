/// FCM push notifications (Phase 4 stub).
/// Wire `firebase_messaging` when Firebase project credentials are available.
/// Intended topics: field "fitting today", customer "quote sent" / "fitting booked".
class PushNotifications {
  static Future<void> init() async {
    // no-op until Firebase is configured for the org
  }

  static Future<String?> deviceToken() async => null;
}
