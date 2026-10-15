import type { SellerOrderView } from '@uzgo/contracts';
import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { spacing } from '@/lib/theme';
import { useApp } from '@/state/app';

/** Return request, decision note and (for customers) the in-app return deadline. */
export function ReturnInfo({
  shipment,
  showDeadline = false,
}: {
  shipment: Pick<
    SellerOrderView,
    'returnRequest' | 'returnDecisionNote' | 'returnUntil' | 'allowedTransitions'
  >;
  showDeadline?: boolean;
}) {
  const { t, locale } = useApp();
  const deadline =
    showDeadline && shipment.returnUntil && shipment.allowedTransitions.includes('RETURN_REQUESTED')
      ? formatDate(shipment.returnUntil, locale)
      : null;
  if (!shipment.returnRequest && !shipment.returnDecisionNote && !deadline) return null;
  return (
    <View style={{ gap: spacing.xs }} testID="return-info">
      {shipment.returnRequest ? (
        <>
          <AppText variant="small" color="foreground">
            {`${t('returnReasonLabel')} ${t(`returnReason_${shipment.returnRequest.reason}`)}`}
          </AppText>
          <AppText>{shipment.returnRequest.comment}</AppText>
        </>
      ) : null}
      {shipment.returnDecisionNote ? (
        <AppText variant="small" color="foreground">
          {`${t('returnDecisionLabel')} ${shipment.returnDecisionNote}`}
        </AppText>
      ) : null}
      {deadline ? (
        <AppText variant="small">{t('returnDeadline', { date: deadline })}</AppText>
      ) : null}
    </View>
  );
}
