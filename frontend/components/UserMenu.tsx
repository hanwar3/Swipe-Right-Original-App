import React from 'react';
import { LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '../contexts/AuthContext';

/**
 * Who you are and a way out. Wallet and Insights already sit in the bottom
 * nav, so repeating them here would only be a second way to the same place.
 */
export default function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const initials =
    `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.email[0].toUpperCase();
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        className="rounded-full outline-none transition active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[#E64BD4]/60"
      >
        <Avatar className="size-[38px] ring-[1.5px] ring-[#E64BD4]">
          <AvatarImage src={user.profilePictureUrl} alt="" />
          <AvatarFallback className="bg-[#241A2A] text-[12.5px] font-bold tracking-[0.02em] text-[#F3EBF8]">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-60 rounded-2xl border-white/[0.08] bg-[#140F18] p-1.5"
      >
        <DropdownMenuLabel className="px-2.5 py-2 font-normal">
          {name && <p className="truncate text-sm font-semibold text-[#F3EBF8]">{name}</p>}
          <p className="truncate text-xs text-[#A99DB3]">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/[0.07]" />
        <DropdownMenuItem onClick={logout} className="rounded-xl px-2.5 py-2 text-[13px] text-[#F3EBF8]">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
