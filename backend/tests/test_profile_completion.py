"""Pure validation tests: python -m unittest backend.tests.test_profile_completion."""
import unittest
from pydantic import ValidationError
from backend.auth import CompleteProfileBody, missing_profile_fields


class ProfileValidationTests(unittest.TestCase):
    def test_missing_affiliation_and_legacy_placeholder(self):
        user = dict(full_name='사용자', organization=None, team_name=' 미지정 ', role_name='', email='')
        self.assertEqual(missing_profile_fields(user), ['organization', 'team_name', 'role_name', 'email'])

    def test_identity_and_privileges_are_not_accepted(self):
        for field in ['user_id', 'employee_id', 'team_id', 'is_admin', 'password', 'must_change_password']:
            with self.subTest(field=field), self.assertRaises(ValidationError):
                CompleteProfileBody.model_validate({field: 'unauthorized'})

    def test_invalid_values_are_rejected(self):
        for data in [{'organization': '미지정'}, {'team_name': '  '}, {'role_name': '미지정'}, {'email': 'invalid'}]:
            with self.subTest(data=data), self.assertRaises(ValidationError):
                CompleteProfileBody.model_validate(data)

    def test_names_are_normalized(self):
        value = CompleteProfileBody(organization='  연구  조직  ', email='qa@example.com')
        self.assertEqual(value.organization, '연구 조직')
        self.assertEqual(set(value.model_dump(exclude_none=True)), {'organization', 'email'})


if __name__ == '__main__':
    unittest.main()
