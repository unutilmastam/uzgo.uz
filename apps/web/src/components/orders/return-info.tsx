import type { SellerOrderView } from '@uzgo/contracts';
import { getFormatter, getTranslations } from 'next-intl/server';

/** Return request, decision note and in-app return deadline of one shipment. */
export async function ReturnInfo({
  shipment,
  showDeadline = false,
}: {
  shipment: Pick<
    SellerOrderView,
    'status' | 'returnRequest' | 'returnDecisionNote' | 'returnUntil' | 'allowedTransitions'
  >;
  showDeadline?: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations('returns'), getFormatter()]);
  const deadline =
    showDeadline && shipment.returnUntil && shipment.allowedTransitions.includes('RETURN_REQUESTED')
      ? format.dateTime(new Date(shipment.returnUntil), {
          dateStyle: 'medium',
          timeZone: 'Asia/Tashkent',
        })
      : null;
  if (!shipment.returnRequest && !shipment.returnDecisionNote && !deadline) return null;
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="return-info">
      {shipment.returnRequest ? (
        <>
          <p>
            <span className="text-muted-foreground">{t('reasonLabel')}</span>{' '}
            <span className="font-medium">{t(`reason_${shipment.returnRequest.reason}`)}</span>
          </p>
          <p className="whitespace-pre-line">{shipment.returnRequest.comment}</p>
        </>
      ) : null}
      {shipment.returnDecisionNote ? (
        <p>
          <span className="text-muted-foreground">{t('decisionLabel')}</span>{' '}
          {shipment.returnDecisionNote}
        </p>
      ) : null}
      {deadline ? (
        <p className="text-muted-foreground">{t('deadline', { date: deadline })}</p>
      ) : null}
    </div>
  );
}
