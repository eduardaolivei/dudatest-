import { useState, type FormEvent } from 'react';
import { useStore } from '../store/StoreContext';
import { categoryNames, isBuiltInSubcategory, subcategoriesFor, themeFor } from '../domain/categories';
import { addSubcategory, removeSubcategory, renameSubcategory, subcategoryUsage } from '../store/actions';
import { Badge, ConfirmButton, Modal, PageHeader } from '../components/ui';
import { Icon } from '../components/Icon';

/** Manage the subcategories of each category: add, rename, remove. */
export default function Categories() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<{ category: string; name: string } | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader title="Categories" subtitle="Add, rename or remove the subcategories you use for expenses and budgets." />
      <div className="grid gap-3 md:grid-cols-2">
        {categoryNames.map((c) => {
          const t = themeFor(c);
          const subs = subcategoriesFor(c, data.settings);
          const hidden = (data.settings.hiddenSubcategories?.[c] ?? []).filter((x) => isBuiltInSubcategory(c, x));
          return (
            <section key={c} className={`rounded-2xl border p-4 ${t.card}`}>
              <div className="mb-3 flex items-center gap-3">
                <span className={`grid h-8 w-8 place-items-center rounded-xl text-base ${t.chip}`} aria-hidden>{t.emoji}</span>
                <h2 className={`text-base font-semibold ${t.title}`}>{c}</h2>
                <span className={`rounded-full px-1.5 text-[11px] font-semibold ${t.chip}`}>{subs.length}</span>
              </div>
              <ul className="flex flex-wrap gap-2">
                {subs.map((s) => (
                  <li key={s}>
                    <button
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${t.sub} hover:opacity-80`}
                      onClick={() => setEditing({ category: c, name: s })}
                      aria-label={`Edit ${s} in ${c}`}
                    >
                      {s}
                      <Icon name="edit" className="h-3 w-3 opacity-50" />
                    </button>
                  </li>
                ))}
                {subs.length === 0 && <li className="text-sm muted">No subcategories yet.</li>}
              </ul>
              <AddSub category={c} existing={subs} buttonClass={t.button} onAdd={(name) => update((d) => addSubcategory(d, c, name), `“${name}” added to ${c}`)} />
              {hidden.length > 0 && (
                <p className="mt-2 text-xs muted">
                  Removed: {hidden.map((h, i) => (
                    <span key={h}>{i > 0 && ', '}<button className="underline" onClick={() => update((d) => addSubcategory(d, c, h), `“${h}” restored`)}>{h}</button></span>
                  ))} — tap to bring back
                </p>
              )}
            </section>
          );
        })}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.name}` : ''}>
        {editing && (
          <EditSub
            category={editing.category}
            name={editing.name}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function AddSub({ category, existing, onAdd, buttonClass }: { category: string; existing: string[]; onAdd: (name: string) => void; buttonClass: string }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setErr('Type a name');
    if (n.includes('›')) return setErr('Please don’t use the › character');
    if (existing.some((x) => x.toLowerCase() === n.toLowerCase())) return setErr(`“${n}” already exists in ${category}`);
    onAdd(n);
    setName('');
    setErr('');
  }
  return (
    <form onSubmit={submit} className="mt-3" noValidate>
      <div className="flex gap-2">
        <input className="input py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="New subcategory…" aria-label={`New subcategory in ${category}`} />
        <button className={`btn shrink-0 px-3 py-1.5 text-xs ${buttonClass}`} aria-label={`Add subcategory to ${category}`}><Icon name="plus" className="h-3.5 w-3.5" />Add</button>
      </div>
      {err && <p className="mt-1 text-xs text-red-600" role="alert">{err}</p>}
    </form>
  );
}

function EditSub({ category, name, onDone }: { category: string; name: string; onDone: () => void }) {
  const { data, update } = useStore();
  const [value, setValue] = useState(name);
  const [err, setErr] = useState('');
  const used = subcategoryUsage(data, category, name);
  const others = subcategoriesFor(category, data.settings).filter((x) => x !== name);

  function save(e: FormEvent) {
    e.preventDefault();
    const n = value.trim();
    if (!n) return setErr('Type a name');
    if (n.includes('›')) return setErr('Please don’t use the › character');
    if (others.some((x) => x.toLowerCase() === n.toLowerCase())) return setErr(`“${n}” already exists in ${category}`);
    update((d) => renameSubcategory(d, category, name, n), n === name ? undefined : `Renamed to “${n}”`);
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3" noValidate>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Badge>{category}</Badge>
        {isBuiltInSubcategory(category, name) && <Badge>built-in</Badge>}
        <Badge>{used} transaction{used === 1 ? '' : 's'} / recurring</Badge>
      </div>
      <label className="block">
        <span className="label">Name</span>
        <input autoFocus className="input" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Subcategory name" />
      </label>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <p className="text-xs muted">Renaming also updates past transactions, recurring items and the budget for it.</p>
      <div className="flex gap-2">
        <button className="btn-primary flex-1">Save</button>
        <ConfirmButton
          label="Remove"
          confirmLabel="Tap again to remove"
          onConfirm={() => {
            update((d) => removeSubcategory(d, category, name), `“${name}” removed`);
            onDone();
          }}
        />
      </div>
      <p className="text-xs muted">Removing hides it from the lists{used ? ` — the ${used} existing item${used === 1 ? '' : 's'} keep their label` : ''}{isBuiltInSubcategory(category, name) ? '. You can bring it back later.' : '.'}</p>
    </form>
  );
}
