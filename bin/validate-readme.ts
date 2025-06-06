import fs from "node:fs";
import path from "node:path";
// @ts-ignore
import glob from "glob";

const mandatorySections = [
  "[Quick Start](#quick-start)",
  "[Libraries and Dependencies](#libraries-and-dependencies)",
  "[Repository Structure](#repository-structure)",
  "[Available Scripts](#available-scripts)",
];

// const recommendedSections = ["[Modules](#modules)"];
const recommendedSections: any[] = [];

const packageJsonGlob = "**/package.json";
const ignorePaths = "**/node_modules/**";

// Read and validate README.md
function checkREADME(
  readmePath: string,
  dependencies: string[],
  devDependencies: string[],
) {
  const content = fs.readFileSync(readmePath, "utf8");

  // Check for all the mandatory sections
  mandatorySections.forEach((section) => {
    if (!content.includes(section)) {
      console.error(`Error: Section "${section}" is missing in ${readmePath}`);
    }
  });

  // Extract the "Libraries and Dependencies" section
  const librariesSectionHeader =
    "[Libraries and Dependencies](#libraries-and-dependencies)";
  const librariesSection = content
    .split(librariesSectionHeader)[1]
    ?.split("\n");

  if (!librariesSection) {
    console.error(
      `Error: Can't find the content for "${librariesSectionHeader}" in ${readmePath}`,
    );
    return;
  }

  // Check if each dependency and devDependency is mentioned in the README.md
  // [...dependencies, ...devDependencies].forEach((dep) => {
  //   if (!librariesSection.some((line: string) => line.includes(dep))) {
  //     console.error(
  //       `Error: Dependency "${dep}" is not mentioned in the ${readmePath} "Libraries and Dependencies" section!`,
  //     );
  //   }
  // });
}

// Find all directories that contain a package.json
glob(
  packageJsonGlob,
  { ignore: ignorePaths },
  (err: Error | null, files: string[]) => {
    if (err) {
      console.error("Error reading the files:", err);
      process.exit(1);
    }

    files.forEach((file: string) => {
      const dir = path.dirname(file);

      // Read and parse the package.json
      const packageJsonPath = path.join(dir, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

      const dependencies = Object.keys(packageJson.dependencies || {});
      const devDependencies = Object.keys(packageJson.devDependencies || {});

      // Check if the directory contains a README.md
      const readmePath = path.join(dir, "README.md");
      if (!fs.existsSync(readmePath)) {
        console.error(`Error: ${readmePath} not found!`);
        return;
      }

      // Validate the README.md
      checkREADME(readmePath, dependencies, devDependencies);
    });

    console.log("README.md validation completed!");
  },
);
