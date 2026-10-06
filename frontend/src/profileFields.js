export const PROFILE_FIELDS = [
  {key:'full_name',label:'이름'},
  {key:'organization',label:'조직',options:'organizations'},
  {key:'team_name',label:'팀',options:'teams'},
  {key:'role_name',label:'직급',options:'roles'},
  {key:'email',label:'이메일'},
];
export function missingProfileFields(user) {
  if (!user) return [];
  return PROFILE_FIELDS.filter(({key})=>['','미지정'].includes(String(user[key]??'').normalize('NFKC').trim()));
}
