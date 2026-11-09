import { Link } from 'react-router-dom';
import { MORE } from '../components/Layout';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/ui';

export default function More() {
  return (
    <div>
      <PageHeader title="More" />
      <div className="grid gap-2 sm:grid-cols-2">
        {MORE.map((m) => (
          <Link key={m.to} to={m.to} className="card flex items-center gap-3 hover:border-brand-500">
            <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-600/15 dark:text-brand-100">
              <Icon name={m.icon} />
            </div>
            <div>
              <div className="font-medium">{m.label}</div>
              <div className="text-xs muted">{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
