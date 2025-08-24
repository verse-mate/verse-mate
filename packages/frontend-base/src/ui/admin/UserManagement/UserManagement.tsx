"use client";
import { api } from "backend-api";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../Button/Button";
import { Table, type TableColumn } from "../../Table/Table";
import styles from "./UserManagement.module.css";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  is_admin: boolean;
  createdAt: string;
}

export const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.admin.users.get();
      if (response.data) {
        setUsers(
          response.data.map((user: any) => ({
            ...user,
            createdAt:
              user.createdAt instanceof Date
                ? user.createdAt.toISOString()
                : user.createdAt,
          })),
        );
      }
    } catch (err) {
      setError("Failed to fetch users");
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggleAdmin = async (
    userId: string,
    currentAdminStatus: boolean,
  ) => {
    try {
      setLoading(true);
      setError(null);
      await (api.admin.user as any)[userId]["admin-status"].patch({
        is_admin: !currentAdminStatus,
      });
      await fetchUsers();
    } catch (err) {
      setError("Failed to update user admin status");
      console.error("Error updating user:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const columns: TableColumn<User>[] = [
    {
      title: "Email",
      property: "email",
    },
    {
      title: "Name",
      property: "firstName",
      render: (user) => `${user.firstName} ${user.lastName}`,
    },
    {
      title: "Admin Status",
      property: "is_admin",
      render: (user) => (
        <span
          className={`${styles.adminStatus} ${user.is_admin ? styles.admin : styles.regular}`}
        >
          {user.is_admin ? "Admin" : "Regular"}
        </span>
      ),
    },
    {
      title: "Created",
      property: "createdAt",
      render: (user) => new Date(user.createdAt).toLocaleDateString(),
    },
    {
      title: "Actions",
      property: "id",
      render: (user) => (
        <Button
          variant="outlined"
          onClick={() => handleToggleAdmin(user.id, user.is_admin)}
          disabled={loading}
        >
          {user.is_admin ? "Remove Admin" : "Make Admin"}
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>User Management</h2>
        <Button variant="outlined" onClick={fetchUsers} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableContainer}>
        <Table columns={columns} data={users} isLoading={loading} zebra />
      </div>
    </div>
  );
};
