import Image from "next/image";
import iconDark from "../../../assets/clin-icon-dark_theme.svg";
import iconLight from "../../../assets/clin-icon-light_theme.svg";
import logoDark from "../../../assets/clin-logo-dark_theme.svg";
import logoLight from "../../../assets/clin-logo-light_theme.svg";
import mayIcon from "../../../assets/maydei-logo.svg";

export function ClinBrand() {
  return (
    <span aria-label="clin" className="flex h-9 shrink-0 items-center">
      <Image src={iconLight} alt="" aria-hidden className="size-7 dark:hidden" priority />
      <Image src={iconDark} alt="" aria-hidden className="hidden size-7 dark:block" priority />
    </span>
  );
}

export function ClinName() {
  return (
    <span aria-label="clin" className="flex h-10 min-w-28 shrink-0 items-center">
      <Image src={logoLight} alt="clin" className="block h-9 w-auto brightness-0 dark:hidden" priority />
      <Image src={logoDark} alt="clin" className="hidden h-9 w-auto brightness-0 invert dark:block" priority />
    </span>
  );
}

export function MaydeiMark() {
  return (
    <span aria-label="Maydei" className="inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm ">
      <Image src={mayIcon} alt="Maydei" aria-hidden className="size-5 object-contain brightness-0 dark:invert" />
    </span>
  );
}
