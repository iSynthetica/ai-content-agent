// DEPRECATED (барʼєр B3): вхід/вихід тепер прямим fetch у BFF (POST /api/auth/sign-in|sign-out),
// без Better Auth react-client. Файл лишено порожнім — щоб не тягнути better-auth у web-бандл і не
// плодити мертвий код. useSession/signIn/signOut ніде більше не вживаються (перевірено grep-ом).
export {};
