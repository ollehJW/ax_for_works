import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('shared_llm', Path(__file__).parents[1] / 'ops/shared-llm.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SharedLLMTests(unittest.TestCase):
    def test_common_settings_and_central_override(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'llm.env'
            path.write_text("OPENAI_MODEL=common\nOPENAI_API_KEY='literal-$key'\nOPENAI_BASE_URL=https://example.invalid\nOPENAI_API_VERSION=test\nWIAREPORT_OPENAI_MODEL=report\n")
            self.assertEqual(module.load_settings(path, 'wiameet')['OPENAI_MODEL'], 'common')
            self.assertEqual(module.load_settings(path, 'wiareport')['OPENAI_MODEL'], 'report')
            self.assertEqual(module.load_settings(path, 'wianews')['OPENAI_API_KEY'], 'literal-$key')

    def test_missing_configuration_fails_closed_without_values(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'llm.env'
            with self.assertRaises(RuntimeError):
                module.load_settings(path, 'wiameet')
            path.write_text('OPENAI_MODEL=private-value\n')
            with self.assertRaises(RuntimeError) as result:
                module.load_settings(path, 'wiameet')
            self.assertNotIn('private-value', str(result.exception))

if __name__ == '__main__':
    unittest.main()
