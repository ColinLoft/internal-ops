import React from 'react';
import { OrganizationPage } from '../organization/OrganizationPage';

export const AdministrationPage: React.FC = () => (
  <OrganizationPage basePath="/admin" administrationMode />
);
