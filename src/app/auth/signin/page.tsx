import { SignInForm } from '@/components/auth/SignInForm';
import Link from 'next/link';

export default function SignInPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <SignInForm />
      <p className="text-center mt-4 text-gray-600">
        Don't have an account?{' '}
        <Link href="/auth/signup" className="text-blue-500 hover:text-blue-600">
          Sign up
        </Link>
      </p>
    </div>
  );
} 