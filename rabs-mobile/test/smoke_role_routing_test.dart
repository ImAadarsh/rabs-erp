import 'package:flutter_test/flutter_test.dart';
import 'package:rabs_mobile/core/auth_state.dart';

void main() {
  test('field role home', () {
    final u = AuthUser(
      id: '1',
      email: 'f@x.com',
      firstName: 'Fit',
      lastName: 'Ter',
      roles: const ['FITTER'],
      capabilities: {'fieldwork'},
    );
    expect(u.home, AppRoleHome.field);
  });

  test('staff role home', () {
    final u = AuthUser(
      id: '2',
      email: 'o@x.com',
      firstName: 'Off',
      lastName: 'Ice',
      roles: const ['OFFICE'],
      capabilities: {'customers', 'quotes', 'fieldwork'},
    );
    expect(u.home, AppRoleHome.staff);
  });

  test('customer portal home', () {
    final u = AuthUser(
      id: '3',
      email: 'c@x.com',
      firstName: '',
      lastName: '',
      roles: const ['CUSTOMER'],
      capabilities: const {},
      isPortal: true,
      customerName: 'Jane',
      rabsCustomerId: '9',
    );
    expect(u.home, AppRoleHome.customer);
  });
}
