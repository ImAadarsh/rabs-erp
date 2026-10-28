import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

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
  bool _obscure = true;
  String? _error;
  String? _info;

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
      _info = null;
    });
    try {
      final auth = ref.read(authProvider.notifier);
      if (_staffMode) {
        if (_email.text.trim().isEmpty || _password.text.isEmpty) {
          setState(() => _error = 'Enter your work email and password.');
          return;
        }
        await auth.loginStaff(_email.text, _password.text);
      } else if (!_otpSent) {
        if (_identifier.text.trim().isEmpty) {
          setState(() => _error = 'Enter the phone or email printed on your quotation.');
          return;
        }
        final r = await auth.requestPortalOtp(_identifier.text);
        setState(() {
          _otpSent = true;
          _info = nz(
            r['message'],
            'If we find your account, a one-time code is on its way. Check your email (or SMS).',
          );
        });
      } else {
        if (_otp.text.trim().length < 4) {
          setState(() => _error = 'Enter the code from your email or SMS.');
          return;
        }
        await auth.verifyPortalOtp(_identifier.text, _otp.text);
      }
    } catch (e) {
      setState(() => _error = apiErrorMessage(e, 'Could not sign in — check details and try again.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFF8F6), Color(0xFFFAF7F5), Color(0xFFF3EDEA)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
                children: [
                  const SizedBox(height: 12),
                  Center(child: Image.asset(RabsBrand.logo, height: 72, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const BrandLogo(height: 56))),
                  const SizedBox(height: 10),
                  Text(
                    RabsBrand.tagline,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey.shade700, fontWeight: FontWeight.w600, letterSpacing: 0.2),
                  ),
                  const SizedBox(height: 28),
                  GuideBanner(
                    title: _staffMode ? 'Staff sign-in' : 'Customer portal',
                    body: _staffMode
                        ? 'Fitters, drivers, surveyors and office use your RABS work email. After login you land on the right home for your role.'
                        : 'Customers track their job, see progress, and accept or decline quotations. Use the phone or email on your quote.',
                    icon: _staffMode ? Icons.badge_outlined : Icons.home_outlined,
                  ),
                  const SizedBox(height: 18),
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
                      _info = null;
                    }),
                  ),
                  const SizedBox(height: 20),
                  if (_staffMode) ...[
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Work email', hintText: 'you@rabsinteriors.app'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _password,
                      obscureText: _obscure,
                      autofillHints: const [AutofillHints.password],
                      decoration: InputDecoration(
                        labelText: 'Password',
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          onPressed: () => setState(() => _obscure = !_obscure),
                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        ),
                      ),
                      onSubmitted: (_) => _busy ? null : _submit(),
                    ),
                  ] else ...[
                    TextField(
                      controller: _identifier,
                      enabled: !_otpSent || true,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'Phone or email on your quote',
                        helperText: 'We never show your code on this screen in production.',
                      ),
                    ),
                    if (_otpSent) ...[
                      const SizedBox(height: 12),
                      TextField(
                        controller: _otp,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'One-time code', hintText: '6-digit code'),
                        onSubmitted: (_) => _busy ? null : _submit(),
                      ),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _otpSent = false;
                                  _otp.clear();
                                  _info = null;
                                }),
                        child: const Text('Use a different phone / email'),
                      ),
                    ],
                  ],
                  if (_info != null) ...[
                    const SizedBox(height: 12),
                    Text(_info!, style: TextStyle(color: Colors.grey.shade800, height: 1.35)),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    ErrorBanner(_error!),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                        : Text(_staffMode
                            ? 'Sign in to RABS'
                            : _otpSent
                                ? 'Verify code & continue'
                                : 'Send my login code'),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    RabsBrand.address,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
                  Text(
                    'Call ${RabsBrand.phone}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: RabsTheme.brandDark, fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
