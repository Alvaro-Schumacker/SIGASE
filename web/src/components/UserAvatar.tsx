import { Avatar, type AvatarProps } from '@mantine/core';
import { initials, profileIconSrc } from '../lib/tasks';

interface Props extends Omit<AvatarProps, 'src'> {
  name: string;
  icon?: string;
}

/** Ícone de perfil do usuário (mesmos ícones da versão atual) ou iniciais. */
export function UserAvatar({ name, icon, ...props }: Props) {
  const src = profileIconSrc(icon);
  return (
    <Avatar src={src} alt={name} color="sigase" radius="xl" variant={src ? 'default' : 'light'} {...props}>
      {initials(name)}
    </Avatar>
  );
}
