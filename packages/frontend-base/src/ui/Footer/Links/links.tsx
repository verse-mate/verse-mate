import Link from "next/link";
import styles from "./links.module.css";

type LinkProps = {
  name: string;
  href: string;
};

type LinksProps = {
  links: LinkProps[];
};

export const Links = ({ links }: LinksProps) => {
  return (
    <div className={`${styles.rightBlock}`}>
      <ul>
        {links.map((link) => (
          <li key={link.name}>
            <Link href={link.href}>{link.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
