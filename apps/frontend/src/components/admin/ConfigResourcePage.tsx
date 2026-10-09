'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import {
  listConfigResource,
  createConfigResource,
  updateConfigResource,
  AdminAuthError,
  type ConfigResource,
} from '@/lib/admin-api';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { cn } from '@/components/ui/cn';

export interface ColumnDef {
  key: string;
  header: string;
  render?: (value: unknown, row: ConfigResource) => React.ReactNode;
  className?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
  hint?: string | null;
  required?: boolean;
  disabled?: boolean;
}

export interface ConfigResourcePageProps {
  /** Backend route path, e.g. 'sales-phases'. */
  resource: string;
  title: string;
  description?: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  /** Singular label for create/edit headings, e.g. 'Sales phase'. */
  singular?: string;
  /**
   * PATCH body sent on deactivate. Undefined/null hides button
   * (resource has no active flag to clear — use status field instead).
   */
  deactivatePatch?: Record<string, unknown> | null;
  deactivateLabel?: string;
}

export function ConfigResourcePage({
  resource,
  title,
  description,
  columns,
  fields,
  singular,
  deactivatePatch,
  deactivateLabel = 'Deactivate',
}: ConfigResourcePageProps) {
  const single = singular ?? title.replace(/s$/, '');
  const [rows, setRows] = useState<ConfigResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ConfigResource | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await listConfigResource<ConfigResource>(resource);
      setRows(data);
      setError(null);
    } catch (e) {
      if (e instanceof AdminAuthError) {
        setError('Session ended. Redirecting to sign-in…');
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('Failed to load data.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [resource]);

  const openCreate = () => {
    setEditingRow(null);
    const initial: Record<string, string> = {};
    fields.forEach((f) => {
      initial[f.key] = '';
    });
    setFormValues(initial);
    setSubmitError(null);
    setModalOpen(true);
  };

  const openEdit = (row: ConfigResource) => {
    setEditingRow(row);
    const initial: Record<string, string> = {};
    fields.forEach((f) => {
      initial[f.key] = (row[f.key] ?? '') as string;
    });
    setFormValues(initial);
    setSubmitError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingRow(null);
    setFormValues({});
    setSubmitError(null);
  };

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const body: Record<string, unknown> = {};
      fields.forEach((f) => {
        const val = formValues[f.key];
        if (val !== '') {
          if (f.type === 'number') body[f.key] = Number(val);
          else if (f.type === 'boolean') body[f.key] = val === 'true';
          else body[f.key] = val;
        }
      });

      if (editingRow) {
        await updateConfigResource(resource, editingRow.id, body);
      } else {
        await createConfigResource(resource, body);
      }
      closeModal();
      await load();
    } catch (e) {
      if (e instanceof ApiError) setSubmitError(e.message);
      else setSubmitError('Save failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!deactivatePatch) return;
    if (!confirm(`Deactivate this ${single.toLowerCase()}?`)) return;
    setDeactivatingId(id);
    try {
      await updateConfigResource(resource, id, deactivatePatch);
      await load();
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
      else alert('Deactivate failed.');
    } finally {
      setDeactivatingId(null);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Admin" title={title} description={description} />
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <Card>
            <CardBody>
              <p className="text-sm text-ink-600" role="status">Loading…</p>
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  if (error && rows.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Admin" title={title} description={description} />
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <Callout tone="danger" title="Could not load data">
            {error}
          </Callout>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title={title}
        description={description}
      >
        <div className="flex items-center gap-2">
          <Button onClick={openCreate} size="md">
            Create {single}
          </Button>
        </div>
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {error ? (
          <Callout tone="warning" title="Partial data">
            {error} Some figures below may be incomplete.
          </Callout>
        ) : null}

        <Card>
          <CardHeader title={title} description={description} />
          <CardBody>
            {rows.length === 0 ? (
              <p className="text-sm text-ink-600">No records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                      {columns.map((col) => (
                        <th key={col.key} scope="col" className={cn('py-2 pr-4', col.className)}>
                          {col.header}
                        </th>
                      ))}
                      <th scope="col" className="py-2 pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-ink-100 last:border-0">
                        {columns.map((col) => (
                          <td key={col.key} className={cn('py-2 pr-4', col.className)}>
                            {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '—')}
                          </td>
                        ))}
                        <td className="py-2 pr-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(row)}
                              disabled={submitting}
                            >
                              Edit
                            </Button>
                            {deactivatePatch ? (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeactivate(row.id)}
                                disabled={submitting || deactivatingId === row.id}
                              >
                                {deactivatingId === row.id ? '…' : deactivateLabel}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={closeModal}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-xl font-bold text-ink-900">
              {editingRow ? `Edit ${single}` : `Create ${single}`}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {submitError && (
                <Callout tone="danger" title="Save failed" role="alert">
                  {submitError}
                </Callout>
              )}
              {fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  name={field.key}
                  type={field.type ?? 'text'}
                  placeholder={field.placeholder}
                  hint={field.hint}
                  required={field.required}
                  value={formValues[field.key] ?? ''}
                  onChange={(v) => handleChange(field.key, v)}
                  disabled={field.disabled || submitting}
                  error={null}
                />
              ))}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" size="md" fullWidth disabled={submitting}>
                  {submitting ? 'Saving…' : editingRow ? 'Save' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}