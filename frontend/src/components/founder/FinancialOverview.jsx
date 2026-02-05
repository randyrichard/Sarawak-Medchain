import { motion } from 'framer-motion';
import AnimatedNumber from '../ui/AnimatedNumber';

/**
 * FinancialOverview - 4 KPI cards showing key financial metrics
 * Shows: Bank Balance, MRR, Pending Payments, Market Cap projection
 */

// Theme constants - Light theme
const theme = {
  success: '#10b981',
  teal: '#14b8a6',
  warning: '#f59e0b',
  purple: '#8b5cf6',
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
};

// Financial card data generator
const getFinancialCards = (bankBalance, mrr, pendingPayments, revenueTarget) => [
  {
    label: 'Total Bank Balance',
    value: bankBalance,
    prefix: 'RM ',
    color: theme.success,
    icon: (
      <svg className="w-5 h-5" fill={theme.success} viewBox="0 0 20 20">
        <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" />
      </svg>
    ),
    subLabel: 'From Payment Gateway API',
  },
  {
    label: 'Monthly Recurring Revenue',
    value: mrr,
    prefix: 'RM ',
    color: theme.teal,
    icon: (
      <svg className="w-5 h-5" fill={theme.teal} viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
      </svg>
    ),
    subLabel: `${Math.round((mrr / revenueTarget) * 100)}% of RM${(revenueTarget / 1000).toFixed(0)}k target`,
    showProgress: true,
    progress: (mrr / revenueTarget) * 100,
  },
  {
    label: 'Pending Payments',
    value: pendingPayments.reduce((sum, p) => sum + p.amount, 0),
    prefix: 'RM ',
    color: theme.warning,
    icon: (
      <svg className="w-5 h-5" fill={theme.warning} viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
    ),
    subLabel: `${pendingPayments.length} invoices awaiting payment`,
  },
  {
    label: 'Projected Market Cap',
    value: 5000000,
    prefix: 'RM ',
    color: theme.purple,
    icon: (
      <svg className="w-5 h-5" fill={theme.purple} viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ),
    subLabel: 'At 10x revenue multiple',
  },
];

export default function FinancialOverview({
  bankBalance = 0,
  mrr = 0,
  pendingPayments = [],
  revenueTarget = 500000,
  className = '',
}) {
  const cards = getFinancialCards(bankBalance, mrr, pendingPayments, revenueTarget);

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-4 gap-6 ${className}`}>
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="pro-card card-hover"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              {card.label}
            </p>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${card.color}20` }}
            >
              {card.icon}
            </div>
          </div>

          <p className="text-3xl font-black mb-2" style={{ color: card.color }}>
            <AnimatedNumber value={card.value} prefix={card.prefix || ''} />
          </p>

          {card.showProgress && (
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: card.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(card.progress, 100)}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          )}

          <p className="text-sm" style={{ color: theme.textMuted }}>
            {card.subLabel}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
