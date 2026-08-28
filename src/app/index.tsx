import { Redirect } from 'expo-router';

// Placeholder entry point. No auth yet, so send everyone to sign-in.
// Later this reads the auth context and redirects into the matching role group.
export default function Index() {
  return <Redirect href="/sign-in" />;
}
