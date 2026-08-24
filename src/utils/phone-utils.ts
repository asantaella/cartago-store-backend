const MOBILE_PHONE_PT_REGEX = /^(9[1236])\d{7}$/;
const MOBILE_PHONE_ES_REGEX = /^(6|7)\d{8}$/;
const MOBILE_PHONE_FR_REGEX = /^(6|7)\d{8}$/;
const MOBILE_PHONE_IT_REGEX = /^(3[1-9])\d{7}$/;

export const isMobilePhone = (phone: string, countryCode: string): boolean => {
  if (!phone || !countryCode) {
    return false;
  }

  const normalizedPhone = phone.replace(/\s+/g, "").replace(/^\+/, "");

  switch (countryCode.toUpperCase()) {
    case "ES":
      return MOBILE_PHONE_ES_REGEX.test(normalizedPhone);
    case "PT":
      return MOBILE_PHONE_PT_REGEX.test(normalizedPhone);
    case "FR":
      return MOBILE_PHONE_FR_REGEX.test(normalizedPhone);
    case "IT":
      return MOBILE_PHONE_IT_REGEX.test(normalizedPhone);
    default:
      return false;
  }
};
