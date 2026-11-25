"""Azure client for services launched by shared-llm.py."""
import os
from openai import AsyncAzureOpenAI


def create_llm_client():
    return AsyncAzureOpenAI(azure_endpoint=os.environ['OPENAI_BASE_URL'],
                            api_key=os.environ['OPENAI_API_KEY'],
                            api_version=os.environ['OPENAI_API_VERSION'],
                            timeout=110, max_retries=0)


def deployment():
    return os.environ['OPENAI_MODEL']
