type Props = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  className: string;
  disabled: boolean;
};

export const Input = ({
  className,
  disabled,
  onChange,
  placeholder,
  value,
}: Props) => {
  return (
    <input
      type="text"
      placeholder={placeholder}
      className={className}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
};
