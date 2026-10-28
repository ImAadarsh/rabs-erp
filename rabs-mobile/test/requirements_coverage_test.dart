import 'package:flutter_test/flutter_test.dart';
import 'package:rabs_mobile/core/auth_state.dart';
import 'package:rabs_mobile/core/config.dart';
import 'package:rabs_mobile/shared/widgets.dart';

/// Maps requirement-doc expectations that must hold in the mobile app layer.
void main() {
  group('Role routing (req: roles / phone-first shells)', () {
    test('fitter lands on field home', () {
      final u = AuthUser(
        id: '1',
        email: 'f@x.com',
        firstName: 'A',
        lastName: 'B',
        roles: const ['FITTER'],
        capabilities: {'fieldwork'},
      );
      expect(u.home, AppRoleHome.field);
      expect(u.can('fieldwork'), isTrue);
      expect(u.can('customers'), isFalse);
    });

    test('office/surveyor lands on staff', () {
      for (final role in ['OFFICE', 'SURVEYOR', 'SALES_REP']) {
        final u = AuthUser(
          id: '2',
          email: 's@x.com',
          firstName: 'S',
          lastName: 'T',
          roles: [role],
          capabilities: {'customers', 'quotes', 'measure', 'appointments'},
        );
        expect(u.home, AppRoleHome.staff, reason: role);
      }
    });

    test('customer portal never sees staff shells', () {
      final u = AuthUser(
        id: '3',
        email: '',
        firstName: '',
        lastName: '',
        roles: const ['CUSTOMER'],
        capabilities: const {},
        isPortal: true,
        customerName: 'Pat',
        rabsCustomerId: '99',
      );
      expect(u.home, AppRoleHome.customer);
      expect(u.displayName, 'Pat');
    });
  });

  group('Config / sync (req: single API source of truth)', () {
    test('API bases point at rabs-api paths', () {
      expect(AppConfig.rabsBase, contains('/api/rabs'));
      expect(AppConfig.portalBase, contains('/api/rabs/portal'));
      expect(AppConfig.iamBase, contains('/api/iam'));
    });
  });

  group('Formatting helpers (req: UK money / dates)', () {
    test('gbp formats sterling', () {
      expect(gbp.format(12.5), contains('12.50'));
    });

    test('fmtDate handles ISO day', () {
      expect(fmtDate('2026-10-21'), isNot(equals('—')));
    });
  });

  group('Auth persistence model', () {
    test('AuthUser round-trips JSON including portal flag', () {
      final u = AuthUser(
        id: '7',
        email: 'a@b.c',
        firstName: 'Ann',
        lastName: 'Bee',
        roles: const ['OFFICE'],
        capabilities: {'customers', 'quotes'},
      );
      final again = AuthUser.fromJson(u.toJson());
      expect(again.id, '7');
      expect(again.can('quotes'), isTrue);
      expect(again.home, AppRoleHome.staff);
    });
  });
}
