import type { InputHTMLAttributes } from "react";

type DirectoryInputAttributes = InputHTMLAttributes<HTMLInputElement> & {
  directory?: string;
  webkitdirectory?: string;
};

export const directoryInputProps: DirectoryInputAttributes = {
  webkitdirectory: "",
};
