import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Calendar, Loader2, Lock, LogOut, Mail, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordInput,
  type ProfileInput,
} from '@shared/schemas';
import { useAuth } from '@/hooks/use-auth';
import { api, ApiClientError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function Settings() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const profileForm = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '' },
  });

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const profileMutation = useMutation({
    mutationFn: api.updateProfile,
    onSuccess: (data) => {
      updateUser(data.user);
      toast.success('Profile updated.');
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.details?.name?.[0]) {
        profileForm.setError('name', { message: error.details.name[0] });
      } else {
        toast.error(error instanceof Error ? error.message : 'Could not update your profile.');
      }
    },
  });

  const passwordMutation = useMutation({
    mutationFn: api.changePassword,
    onSuccess: () => {
      passwordForm.reset({ currentPassword: '', newPassword: '' });
      toast.success('Password changed. Other sessions have been signed out.');
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        if (error.details?.currentPassword?.[0]) {
          passwordForm.setError('currentPassword', { message: error.details.currentPassword[0] });
        }
        if (error.details?.newPassword?.[0]) {
          passwordForm.setError('newPassword', { message: error.details.newPassword[0] });
        }
        toast.error(error.message);
      } else {
        toast.error('Could not change your password.');
      }
    },
  });

  if (!user) return null;

  return (
    <>
      <PageHeader title="Settings" description="Manage your account details and security." />

      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>This name is shown in the dashboard and on incident notifications.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={profileForm.handleSubmit((values) => profileMutation.mutate(values))}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Full name</Label>
                <Input
                  id="profile-name"
                  autoComplete="name"
                  aria-invalid={Boolean(profileForm.formState.errors.name)}
                  {...profileForm.register('name')}
                />
                {profileForm.formState.errors.name ? (
                  <p className="text-xs text-destructive">{profileForm.formState.errors.name.message}</p>
                ) : null}
              </div>
              <Button type="submit" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your sign-in identity and session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Email</span>
              <span className="ml-auto font-medium">{user.email}</span>
            </div>
            <Separator />
            <div className="flex items-center gap-3 text-sm">
              <UserRound className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Name</span>
              <span className="ml-auto font-medium">{user.name}</span>
            </div>
            <Separator />
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Member since</span>
              <span className="ml-auto font-medium">{formatDate(user.createdAt)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Sessions expire after 7 days. Signing out removes this session immediately.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  void logout().then(() => navigate('/login', { replace: true }));
                }}
              >
                <LogOut className="size-4" /> Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Use at least 10 characters with a letter and a number. Changing your password signs out every other
              session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={passwordForm.handleSubmit((values) => passwordMutation.mutate(values))}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(passwordForm.formState.errors.currentPassword)}
                  {...passwordForm.register('currentPassword')}
                />
                {passwordForm.formState.errors.currentPassword ? (
                  <p className="text-xs text-destructive">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(passwordForm.formState.errors.newPassword)}
                  {...passwordForm.register('newPassword')}
                />
                {passwordForm.formState.errors.newPassword ? (
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">At least 10 characters, one letter and one number.</p>
                )}
              </div>
              <Button type="submit" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monitoring behaviour</CardTitle>
            <CardDescription>How UptimeGuard checks your websites.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>· Checks run automatically every 5 minutes, with a per-website interval you can change.</p>
            <p>· A site is considered down when the check times out, fails to connect, or returns HTTP 4xx/5xx.</p>
            <p>· An incident opens on the first failure and closes automatically on the first successful recovery.</p>
            <p>· Monitoring history is retained for 90 days; incidents for 180 days.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
