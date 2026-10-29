import Button, { type ButtonProps } from './Button';

type IconButtonProps = Omit<ButtonProps, 'size' | 'aria-label'> & {
  label: string;
  size?: 'xs' | 'sm' | 'md';
};

const sizes = {
  xs: 'icon-xs',
  sm: 'icon-sm',
  md: 'icon',
} as const;

export default function IconButton({
  label,
  size = 'sm',
  title = label,
  ...props
}: IconButtonProps) {
  return (
    <Button aria-label={label} title={title} size={sizes[size]} {...props} />
  );
}
