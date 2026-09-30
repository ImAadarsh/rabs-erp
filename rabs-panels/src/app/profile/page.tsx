'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { getSession } from '@/lib/auth';
import { getCurrentUser, updateCurrentUser, changePassword, setPassword } from '@/lib/api';
import { User, Lock, Mail, Shield, Building, Calendar, Save, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [editMode, setEditMode] = useState(false);

    // Profile form state
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        username: '',
        email: ''
    });

    // Password form state
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });
    const [isSSOUser, setIsSSOUser] = useState(false);

    useEffect(() => {
        const s = getSession();
        if (!s?.accessToken) {
            router.replace('/login');
            return;
        }

        loadProfile();
    }, [router]);

    const loadProfile = async () => {
        try {
            setLoading(true);
            const res = await getCurrentUser();
            setProfile(res.data);
            setFormData({
                firstName: res.data.firstName || '',
                lastName: res.data.lastName || '',
                username: res.data.username || '',
                email: res.data.email || ''
            });
            // Check if user is SSO-only (has SSO provider but no password)
            setIsSSOUser(
                (res.data.ssoProvider === 'google' || res.data.ssoProvider === 'microsoft') &&
                !res.data.passwordHash
            );
        } catch (error: any) {
            console.error('Failed to load profile:', error);
            toast.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            await updateCurrentUser({
                firstName: formData.firstName || null,
                lastName: formData.lastName || null,
                username: formData.username || null,
                email: formData.email
            });
            toast.success('Profile updated successfully');
            setEditMode(false);
            await loadProfile();
        } catch (error: any) {
            console.error('Failed to update profile:', error);
            toast.error(error.response?.data?.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        if (passwordData.newPassword.length < 8) {
            toast.error('Password must be at least 8 characters long');
            return;
        }

        try {
            setSaving(true);
            
            // If SSO user without password, use setPassword instead
            if (isSSOUser) {
                await setPassword({
                    password: passwordData.newPassword
                });
                toast.success('Password set successfully. You can now login with email and password.');
                setIsSSOUser(false); // User now has a password
            } else {
                await changePassword({
                    currentPassword: passwordData.currentPassword,
                    newPassword: passwordData.newPassword
                });
                toast.success('Password changed successfully');
            }
            
            setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });
        } catch (error: any) {
            console.error('Failed to change password:', error);
            toast.error(error.response?.data?.error?.message || error.response?.data?.message || 'Failed to set password');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen app-surface">
                <Sidebar />
                <div className="flex flex-col lg:ml-[280px]">
                    <Header title="Profile" />
                    <main className="p-4 md:p-6">
                        <div className="flex items-center justify-center h-64">
                            <div className="text-muted-foreground">Loading profile...</div>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen app-surface">
            <Sidebar />
            <div className="flex flex-col lg:ml-[280px]">
                <Header title="Profile" />
                <main className="p-4 md:p-6 space-y-6 max-w-4xl">
                    {/* Back Button */}
                    <div>
                        <button
                            onClick={() => router.back()}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors font-medium text-sm"
                        >
                            <ArrowLeft size={16} />
                            <span>Back</span>
                        </button>
                    </div>

                    {/* Profile Information */}
                    <section className="rounded-2xl border border-border bg-card p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User size={20} className="text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Profile Information</h2>
                                    <p className="text-sm text-muted-foreground">Manage your personal details</p>
                                </div>
                            </div>
                            {!editMode && (
                                <button
                                    onClick={() => setEditMode(true)}
                                    className="px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium text-sm"
                                >
                                    Edit Profile
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleProfileUpdate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        First Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        disabled={!editMode}
                                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Enter first name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Last Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        disabled={!editMode}
                                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Enter last name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Username
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        disabled={!editMode}
                                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Enter username"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        disabled={!editMode}
                                        required
                                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Enter email"
                                    />
                                </div>
                            </div>

                            {editMode && (
                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-sm flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Save size={16} />
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditMode(false);
                                            setFormData({
                                                firstName: profile.firstName || '',
                                                lastName: profile.lastName || '',
                                                username: profile.username || '',
                                                email: profile.email || ''
                                            });
                                        }}
                                        disabled={saving}
                                        className="px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-muted transition-colors font-medium text-sm disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </form>
                    </section>

                    {/* Account Details */}
                    <section className="rounded-2xl border border-border bg-card p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Shield size={20} className="text-primary" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">Account Details</h2>
                                <p className="text-sm text-muted-foreground">Read-only account information</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30">
                                <Mail size={18} className="text-primary mt-0.5" />
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">User ID</div>
                                    <div className="text-sm font-mono text-foreground">{profile?.id}</div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30">
                                <Building size={18} className="text-primary mt-0.5" />
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">Organization ID</div>
                                    <div className="text-sm font-mono text-foreground">{profile?.organizationId}</div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30">
                                <Shield size={18} className="text-primary mt-0.5" />
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">Roles</div>
                                    <div className="text-sm text-foreground">
                                        {profile?.roles?.map((r: any) => r.name).join(', ') || 'No roles assigned'}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30">
                                <Calendar size={18} className="text-primary mt-0.5" />
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">Status</div>
                                    <div className="text-sm text-foreground capitalize">{profile?.status || 'active'}</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Change Password / Set Password */}
                    <section className="rounded-2xl border border-border bg-card p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Lock size={20} className="text-primary" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">
                                    {isSSOUser ? 'Set Password' : 'Change Password'}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {isSSOUser 
                                        ? 'Add a password to enable email/password login' 
                                        : 'Update your account password'}
                                </p>
                            </div>
                        </div>

                        {isSSOUser && (
                            <div className="mb-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-blue-900 dark:text-blue-200">
                                    You logged in with a social account. Set a password below to enable email/password login.
                                </p>
                            </div>
                        )}

                        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                            {!isSSOUser && (
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Current Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPasswords.current ? 'text' : 'password'}
                                            value={passwordData.currentPassword}
                                            onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                            required
                                            className="w-full px-4 py-2.5 pr-12 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                                            placeholder="Enter current password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    New Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPasswords.new ? 'text' : 'password'}
                                        value={passwordData.newPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                        required
                                        minLength={8}
                                        className="w-full px-4 py-2.5 pr-12 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Enter new password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Must be at least 8 characters</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Confirm New Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPasswords.confirm ? 'text' : 'password'}
                                        value={passwordData.confirmPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                        required
                                        className="w-full px-4 py-2.5 pr-12 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Confirm new password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={saving}
                                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-sm flex items-center gap-2 disabled:opacity-50"
                            >
                                <Lock size={16} />
                                {saving 
                                    ? (isSSOUser ? 'Setting Password...' : 'Changing Password...') 
                                    : (isSSOUser ? 'Set Password' : 'Change Password')}
                            </button>
                        </form>
                    </section>
                </main>
            </div>
        </div>
    );
}

