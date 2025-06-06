type Props = {
  children: React.ReactNode;
  type: "submit" | "button";
  disabled: boolean;
  className?: string;
  handleMouseEnter?: () => void;
  handleMouseLeave?: () => void;
};

export const Button = ({
  children,
  type,
  disabled,
  className,
  handleMouseEnter,
  handleMouseLeave,
}: Props) => {
  return (
    <button
      type={type}
      className={className}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </button>
  );
};
