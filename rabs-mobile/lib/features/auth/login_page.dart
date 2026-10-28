import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/theme.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _identifier = TextEditingController();
  final _otp = TextEditingController();
  bool _staffMode = true;
  bool _otpSent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _identifier.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = ref.read(authProvider.notifier);
      if (_staffMode) {
        await auth.loginStaff(_email.text, _password.text);
      } else if (!_otpSent) {
        await auth.requestPortalOtp(_identifier.text);
        setState(() => _otpSent = true);
      } else {
        await auth.verifyPortalOtp(_identifier.text, _otp.text);
      }
    } catch (e) {
      setState(() => _error = apiErrorMessage(e, 'Login failed'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                const SizedBox(height: 24),
                Text('RABS', style: Theme.of(context).textTheme.displaySmall?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: RabsTheme.brandDark,
                    )),
                const SizedBox(height: 4),
                Text(
                  'Carpets & Furniture',
                  style: TextStyle(color: Colors.grey.shade600, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 28),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: true, label: Text('Staff'), icon: Icon(Icons.badge_outlined)),
                    ButtonSegment(value: false, label: Text('Customer'), icon: Icon(Icons.home_outlined)),
                  ],
                  selected: {_staffMode},
                  onSelectionChanged: (s) => setState(() {
                    _staffMode = s.first;
                    _otpSent = false;
                    _error = null;
                  }),
                ),
                const SizedBox(height: 24),
                if (_staffMode) ...[
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(labelText: 'Email'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: const InputDecoration(labelText: 'Password'),
                    onSubmitted: (_) => _submit(),
                  ),
                ] else ...[
                  TextField(
                    controller: _identifier,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'Phone or email',
                      helperText: 'Use the phone or email on your quote',
                    ),
                  ),
                  if (_otpSent) ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: _otp,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'One-time code'),
                      onSubmitted: (_) => _submit(),
                    ),
                  ],
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C))),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(_staffMode
                          ? 'Sign in'
                          : _otpSent
                              ? 'Verify & continue'
                              : 'Send code'),
                ),
                const SizedBox(height: 16),
                Text(
                  _staffMode
                      ? 'Fitters, drivers and office staff sign in here.'
                      : 'Customers track jobs and accept quotes here.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
