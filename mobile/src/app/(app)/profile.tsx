import React from 'react';
import ProfileView from '../../components/ProfileView';
import { useSession } from '../../lib/session';

export default function MyProfile() {
  const { me } = useSession();
  return me ? <ProfileView userKey={me.id} /> : null;
}
