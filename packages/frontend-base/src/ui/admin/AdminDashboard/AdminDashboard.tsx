"use client";
import { useState } from "react";
import { Button } from "../../Button/Button";
import { BatchOperations } from "../BatchOperations/BatchOperations";
import { ExplanationRegeneration } from "../ExplanationRegeneration/ExplanationRegeneration.tsx";
import { Playground } from "../Playground/Playground";
import { PromptManagement } from "../PromptManagement/PromptManagement";
import { UserManagement } from "../UserManagement/UserManagement";
import styles from "./AdminDashboard.module.css";

type AdminSection =
  | "batch"
  | "explanations"
  | "users"
  | "prompts"
  | "playground";

export const AdminDashboard = () => {
  const [activeSection, setActiveSection] = useState<AdminSection>("batch");

  const renderActiveSection = () => {
    switch (activeSection) {
      case "batch":
        return <BatchOperations />;
      case "explanations":
        return <ExplanationRegeneration />;
      case "users":
        return <UserManagement />;
      case "prompts":
        return <PromptManagement />;
      case "playground":
        return <Playground />;
      default:
        return <BatchOperations />;
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
        <nav className={styles.navigation}>
          <Button
            variant={activeSection === "batch" ? "contained" : "outlined"}
            onClick={() => setActiveSection("batch")}
          >
            Batch Operations
          </Button>
          <Button
            variant={
              activeSection === "explanations" ? "contained" : "outlined"
            }
            onClick={() => setActiveSection("explanations")}
          >
            Explanation Regeneration
          </Button>
          <Button
            variant={activeSection === "users" ? "contained" : "outlined"}
            onClick={() => setActiveSection("users")}
          >
            User Management
          </Button>
          <Button
            variant={activeSection === "prompts" ? "contained" : "outlined"}
            onClick={() => setActiveSection("prompts")}
          >
            Prompts
          </Button>
          <Button
            variant={activeSection === "playground" ? "contained" : "outlined"}
            onClick={() => setActiveSection("playground")}
          >
            Playground
          </Button>
        </nav>
      </header>
      <main className={styles.content}>{renderActiveSection()}</main>
    </div>
  );
};
