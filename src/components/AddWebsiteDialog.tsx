import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import type { CreateWebsiteInput } from '@shared/schemas';
import { CHECK_INTERVALS, createWebsiteSchema } from '@shared/schemas';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FIELD_NAMES = ['url', 'name', 'intervalMinutes'] as const;

export function AddWebsiteDialog({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<CreateWebsiteInput>({
    resolver: zodResolver(createWebsiteSchema),
    defaultValues: { url: '', name: '', intervalMinutes: 5 },
  });

  useEffect(() => {
    if (!open) {
      form.reset({ url: '', name: '', intervalMinutes: 5 });
    }
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: api.createWebsite,
    onSuccess: (data) => {
      toast.success(`${data.website.name} is now being monitored.`);
      void queryClient.invalidateQueries({ queryKey: ['websites'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        if (error.details) {
          for (const field of FIELD_NAMES) {
            const message = error.details[field]?.[0];
            if (message) form.setError(field, { message });
          }
        }
        if (error.code !== 'validation_error') toast.error(error.message);
      } else {
        toast.error('Could not add the website. Please try again.');
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button>
            <Plus className="size-4" /> Add website
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a website</DialogTitle>
          <DialogDescription>
            We&apos;ll check it every few minutes from Cloudflare&apos;s network and record uptime, response time
            and incidents.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="website-url">Website URL</Label>
            <Input
              id="website-url"
              placeholder="https://example.com"
              autoComplete="url"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.url)}
              {...form.register('url')}
            />
            {form.formState.errors.url ? (
              <p className="text-xs text-destructive">{form.formState.errors.url.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Public HTTP or HTTPS websites only.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website-name">
              Display name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="website-name"
              placeholder="Marketing site"
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Check interval</Label>
            <Controller
              control={form.control}
              name="intervalMinutes"
              render={({ field }) => (
                <Select
                  value={String(field.value ?? 5)}
                  onValueChange={(value) => field.onChange(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Every 5 minutes" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHECK_INTERVALS.map((interval) => (
                      <SelectItem key={interval} value={String(interval)}>
                        {interval === 60 ? 'Every hour' : `Every ${interval} minutes`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.intervalMinutes ? (
              <p className="text-xs text-destructive">{form.formState.errors.intervalMinutes.message}</p>
            ) : null}
          </div>

          <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Localhost, private IPs and internal hostnames are rejected to prevent server-side request forgery.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add website
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
