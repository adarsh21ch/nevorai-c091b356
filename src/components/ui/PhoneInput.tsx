import * as React from "react";
import PhoneInput, { isValidPhoneNumber as _isValid } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";

export type NPhoneInputProps = {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
  defaultCountry?: any;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
};

/**
 * International phone input. Default country: India.
 * Value is always E.164 (e.g. "+919876543210" or "+12025551234") or undefined.
 */
export const NPhoneInput = React.forwardRef<HTMLInputElement, NPhoneInputProps>(
  ({ value, onChange, placeholder, className, defaultCountry = "IN", ...rest }, ref) => {
    return (
      <PhoneInput
        international
        defaultCountry={defaultCountry}
        countryCallingCodeEditable={false}
        addInternationalOption={false}
        value={value || undefined}
        onChange={onChange}
        placeholder={placeholder || "Enter phone number"}
        numberInputProps={{
          ref: ref as any,
          className: cn("n-phone-number-input", className),
          ...rest,
        }}
        className="n-phone-input-root"
      />
    );
  }
);
NPhoneInput.displayName = "NPhoneInput";

export const isValidPhoneNumber = (v: string | undefined | null): boolean => {
  if (!v) return false;
  try {
    return _isValid(v);
  } catch {
    return false;
  }
};

/**
 * Normalize a possibly-legacy stored value into an E.164 string suitable for
 * react-phone-number-input. Legacy 10-digit Indian numbers are upgraded to
 * +91XXXXXXXXXX. Returns undefined for empty/unrenderable input.
 */
export const toDisplayE164 = (raw: string | null | undefined): string | undefined => {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (s.startsWith("+")) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return `+91${digits}`;
};
