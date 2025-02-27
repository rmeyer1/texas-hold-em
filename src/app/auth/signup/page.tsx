import { SignUpForm } from '@/components/auth/SignUpForm';
import Link from 'next/link';

export default function SignUpPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <SignUpForm />
      <p className="text-center mt-4 text-gray-600">
        Already have an account?{' '}
        <Link href="/auth/signin" className="text-blue-500 hover:text-blue-600">
          Sign in
        </Link>
      </p>
    </div>
  );
} 