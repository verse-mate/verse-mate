import { BrowserRouter as ReactBrowserRouter } from "react-router-dom";

export const BrowserRouter = ({ children }: { children: React.ReactNode }) => {
  return <ReactBrowserRouter>{children}</ReactBrowserRouter>;
};
