import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildUpiLink, getOnlinePaymentMode } from "@/lib/payments";
import { qrDataUrl } from "@/lib/qr";
import { PageHeader } from "@/components/ui";
import { appUrl } from "@/lib/utils";
import { CounterModeForm, AggregatorForm, GstForm, LoyaltyForm, WhatsAppForm, MenuSettingsForm, PaymentBasicsForm, ProfileForm, RazorpayForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireRestaurantSession(MANAGE_ROLES);
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: session.restaurantId } });
  const isOwner = session.role === "OWNER";
  const mode = getOnlinePaymentMode(r);
  const waLog = isOwner ? await db.whatsAppMessage.findMany({ where: { restaurantId: r.id }, orderBy: { createdAt: "desc" }, take: 15 }) : [];
  const upiPreview = r.upiId ? await qrDataUrl(buildUpiLink({ upiId: r.upiId, payeeName: r.upiPayeeName || r.name }), 200) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" />
      <ProfileForm
        r={{
          name: r.name,
          phone: r.phone ?? "",
          email: r.email ?? "",
          address: r.address ?? "",
          city: r.city ?? "",
          state: r.state ?? "",
          pincode: r.pincode ?? "",
          fssaiNumber: r.fssaiNumber ?? "",
          logoUrl: r.logoUrl ?? "",
        }}
      />
      <MenuSettingsForm
        r={{
          qrOrderingEnabled: r.qrOrderingEnabled,
          autoAcceptQrOrders: r.autoAcceptQrOrders,
          whatsappOrderingEnabled: r.whatsappOrderingEnabled,
          whatsappNumber: r.whatsappNumber ?? "",
          menuThemeColor: r.menuThemeColor,
        }}
      />
      <CounterModeForm enabled={r.tokenMode} displayUrl={appUrl(`/token/${r.displayKey}`)} />
      {isOwner ? (
        <>
          <GstForm
            r={{
              gstEnabled: r.gstEnabled,
              gstin: r.gstin ?? "",
              gstMode: r.gstMode,
              defaultGstRate: r.defaultGstRate.toString(),
              serviceChargeEnabled: r.serviceChargeEnabled,
              serviceChargeRate: r.serviceChargeRate.toString(),
              invoicePrefix: r.invoicePrefix,
              requireManagerPin: r.requireManagerPin,
            }}
          />
          <LoyaltyForm
            r={{
              loyaltyEnabled: r.loyaltyEnabled,
              loyaltyEarnPer100: r.loyaltyEarnPer100.toString(),
              loyaltyPointValue: r.loyaltyPointValue.toString(),
              loyaltyMinRedeem: r.loyaltyMinRedeem,
              birthdayOfferText: r.birthdayOfferText,
              reservationsEnabled: r.reservationsEnabled,
              winbackEnabled: r.winbackEnabled,
              winbackDays: r.winbackDays,
              winbackOffer: r.winbackOffer,
            }}
          />
          <AggregatorForm r={{ zomatoCommission: r.zomatoCommission.toString(), swiggyCommission: r.swiggyCommission.toString() }} />
          <WhatsAppForm
            r={{
              waPhoneNumberId: r.waPhoneNumberId ?? "",
              hasToken: !!r.waAccessTokenEnc,
              waTemplateLang: r.waTemplateLang,
              waBillTemplate: r.waBillTemplate ?? "",
              waBookingTemplate: r.waBookingTemplate ?? "",
              waBirthdayTemplate: r.waBirthdayTemplate ?? "",
              waSummaryTemplate: r.waSummaryTemplate ?? "",
              waWinbackTemplate: r.waWinbackTemplate ?? "",
            }}
            log={waLog.map((m) => ({
              id: m.id,
              when: m.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" }),
              to: m.to,
              kind: m.kind,
              status: m.status,
              error: m.error,
            }))}
          />
          <div id="payments" className="scroll-mt-6 space-y-6">
            <PaymentBasicsForm
              mode={mode}
              upiPreview={upiPreview}
              r={{ upiId: r.upiId ?? "", upiPayeeName: r.upiPayeeName ?? "", acceptCash: r.acceptCash, acceptCard: r.acceptCard }}
            />
            <RazorpayForm keyId={r.razorpayKeyId ?? ""} hasSecret={!!r.razorpayKeySecretEnc} hasWebhookSecret={!!r.razorpayWebhookSecretEnc} webhookUrl={appUrl(`/api/webhooks/razorpay/${r.id}`)} />
          </div>
        </>
      ) : (
        <p className="text-sm text-stone-500">GST and payment settings can only be changed by the owner.</p>
      )}
    </div>
  );
}
