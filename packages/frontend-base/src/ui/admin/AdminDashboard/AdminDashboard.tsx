"use client";
import { useState } from "react";
import { Button } from "../../Button/Button";
import { HomeIcon } from "../../Icons";
import { AutoHighlights } from "../AutoHighlights";
import { BatchOperations } from "../BatchOperations/BatchOperations";
import { ExplanationRegeneration } from "../ExplanationRegeneration/ExplanationRegeneration";
import { Explanations } from "../Explanations/Explanations";
import { Playground } from "../Playground/Playground";
import { PromptManagement } from "../PromptManagement/PromptManagement";
import { TopicsAdmin } from "../Topics";
import { UserManagement } from "../UserManagement/UserManagement";
import styles from "./AdminDashboard.module.css";

type AdminSection =
  | "batch"
  | "explanation-regeneration"
  | "users"
  | "prompts"
  | "playground"
  | "explanations"
  | "topics"
  | "auto-highlights";

export const AdminDashboard = () => {
  const [activeSection, setActiveSection] = useState<AdminSection>("batch");

  const renderActiveSection = () => {
    switch (activeSection) {
      case "batch":
        return <BatchOperations />;
      case "explanation-regeneration":
        return <ExplanationRegeneration />;
      case "users":
        return <UserManagement />;
      case "prompts":
        return <PromptManagement />;
      case "playground":
        return <Playground />;
      case "explanations":
        return <Explanations />;
      case "topics":
        return <TopicsAdmin />;
      case "auto-highlights":
        return <AutoHighlights />;
      default:
        return <BatchOperations />;
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
        <nav className={styles.navigation}>
          <div className={styles.tabButtons}>
            <Button
              variant={activeSection === "batch" ? "contained" : "outlined"}
              onClick={() => setActiveSection("batch")}
            >
              Batch Operations
            </Button>
            <Button
              variant={
                activeSection === "explanation-regeneration"
                  ? "contained"
                  : "outlined"
              }
              onClick={() => setActiveSection("explanation-regeneration")}
            >
              Explanation Regeneration
            </Button>
            <Button
              variant={
                activeSection === "explanations" ? "contained" : "outlined"
              }
              onClick={() => setActiveSection("explanations")}
            >
              Explanations
            </Button>
            <Button
              variant={activeSection === "topics" ? "contained" : "outlined"}
              onClick={() => setActiveSection("topics")}
            >
              Topics
            </Button>
            <Button
              variant={
                activeSection === "auto-highlights" ? "contained" : "outlined"
              }
              onClick={() => setActiveSection("auto-highlights")}
            >
              Auto-Highlights
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
              variant={
                activeSection === "playground" ? "contained" : "outlined"
              }
              onClick={() => setActiveSection("playground")}
            >
              Playground
            </Button>
          </div>
          <Button
            variant="outlined"
            onClick={() => window.location.assign("/")}
          >
            <HomeIcon />
          </Button>
        </nav>
      </header>
      <main className={styles.content}>{renderActiveSection()}</main>
    </div>
  );
};
