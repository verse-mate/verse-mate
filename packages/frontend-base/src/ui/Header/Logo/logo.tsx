import Link from "next/link";
import { VerseMateLogoExtended } from "../../Icons";

type LogoProps = {
  link: string;
};

export const Logo = ({ link }: LogoProps) => {
  return (
    <Link href={link}>
      <VerseMateLogoExtended />
    </Link>
  );
};
