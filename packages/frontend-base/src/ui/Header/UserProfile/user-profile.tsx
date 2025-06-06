"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { destroyCookie } from "nookies";
import { useState } from "react";
import { userSession } from "../../../hooks/userSession";
import { ArrowUpDown, LogoutIcon, SettingsIcon, UserIcon } from "../../Icons";
import styles from "./user-profile.module.css";

type UserProfileProps = {
  link: string;
};

export const ProfileButton = ({ link }: UserProfileProps) => {
  const { session } = userSession();
  const [person, setPerson] = useState("");

  const handleLogout = async () => {
    destroyCookie(null, "accessToken");
    window.location.reload();
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <div className={`${styles.trigger}`}>
          <span className={`${styles.profileIcon}`}>
            <UserIcon className={styles.personIcon} />
          </span>
          <div className={`${styles.userInfo}`}>
            <span className={`${styles.username}`}>
              {session?.firstName} {session?.lastName}
            </span>
            <span className={`${styles.email}`}>{session?.email}</span>
          </div>
          <span className={`${styles.arrowUpDown}`}>
            <ArrowUpDown className={`${styles.arrowUpDownIcon}`} />
          </span>
        </div>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={8}>
          <DropdownMenu.DropdownMenuLabel className={`${styles.subInfo}`}>
            <span className={`${styles.profileIcon}`}>
              <UserIcon className={styles.personIcon} />
            </span>
            <div className={`${styles.userInfo}`}>
              <span className={`${styles.username}`}>
                {session?.firstName} {session?.lastName}
              </span>
              <span className={`${styles.email}`}>{session?.email}</span>
            </div>
          </DropdownMenu.DropdownMenuLabel>
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.RadioGroup
            value={person}
            onValueChange={setPerson}
            className={`${styles.groupItem}`}
          >
            {/* <Link href={link}>
              <DropdownMenu.Item className={styles.item}>
                Settings
                <div className={styles.slot}>
                  <SettingsIcon className={styles.settingsIcon} />
                </div>
              </DropdownMenu.Item>
            </Link> */}
            {/* <DropdownMenu.Separator className={styles.separator} /> */}
            <DropdownMenu.Item className={styles.item} onClick={handleLogout}>
              Logout{" "}
              <div className={styles.slot}>
                <LogoutIcon className={styles.logoutIcon} />
              </div>
            </DropdownMenu.Item>
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
